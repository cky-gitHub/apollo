import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const EXPLODE_GAP = 15 // meters of extra spacing per stage boundary once exploded
const STAGE_TRANSITION_DURATION = 800 // ms
const CLICK_DRAG_THRESHOLD = 5 // px of pointer movement still counted as a click
const SVG_NS = 'http://www.w3.org/2000/svg'
const LABEL_OFFSET_X = 110 // px, callout sits this far to the side of its stage's screen anchor (less on narrow screens)
const LABEL_OFFSET_Y = -6 // px
const LABEL_GAP = 8 // px between the leader line's end and the text
const LABEL_MARGIN = 12 // px the text always keeps from the screen edges
const LABEL_MIN_WIDTH = 72 // px a wrapped label is never squeezed below

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// Rocket click-to-inspect: standing -> exploded -> (click a stage) isolated.
// Owns OrbitControls (enabled only in inspect mode) and simple screen-
// projected HTML labels, one per stage. Reads/writes state exclusively
// through flowStore — never mutates flow/inspect state directly on itself.
export class InspectionController {
  constructor({ camera, renderer, rocket, stageGroups, labelContainer, flowStore }) {
    this.camera = camera
    this.renderer = renderer
    this.rocket = rocket
    this.stageGroups = stageGroups
    this.flowStore = flowStore
    this._choreography = null // wired post-construction via setChoreography(); see SceneManager.init()

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()

    this._stackY = new Map()
    stageGroups.forEach((group, stageId) => this._stackY.set(stageId, group.position.y))
    this._transitions = new Map() // stageId -> { fromY, toY, start }

    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enabled = false
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 12
    // Generous ceiling: inspect mode inherits the camera from WHEREVER the
    // mission framing currently is (it no longer jumps to a canned offset),
    // and some flow shots sit farther out than the old 260 — a tighter clamp
    // would visibly yank the camera inward on the first controls.update().
    this.controls.maxDistance = 700
    this._applyTouchAction('flow')

    this._labelContainer = labelContainer

    // Leader lines + anchor dots live in one SVG layer under the label text,
    // so each callout reads as "floating text, pointing back at its stage"
    // rather than a box glued to the mesh.
    this._svg = document.createElementNS(SVG_NS, 'svg')
    Object.assign(this._svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
    })
    labelContainer.appendChild(this._svg)

    this._labelElements = new Map()
    this._leaderLines = new Map()
    this._anchorDots = new Map()
    stageGroups.forEach((group, stageId) => {
      const line = document.createElementNS(SVG_NS, 'line')
      line.setAttribute('stroke', 'rgba(255, 255, 255, 0.55)')
      line.setAttribute('stroke-width', '1')
      this._svg.appendChild(line)
      this._leaderLines.set(stageId, line)

      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('r', '2.5')
      dot.setAttribute('fill', 'rgba(255, 255, 255, 0.85)')
      this._svg.appendChild(dot)
      this._anchorDots.set(stageId, dot)

      const el = document.createElement('div')
      el.textContent = group.userData.label ?? stageId
      Object.assign(el.style, {
        position: 'absolute',
        color: '#ffffff',
        fontFamily: 'var(--label-font, Inter, system-ui, sans-serif)',
        fontWeight: '300',
        fontSize: 'clamp(13px, 3.6vw, 16px)',
        lineHeight: '1.25',
        letterSpacing: '0.02em',
        textShadow: '0 1px 6px rgba(0, 0, 0, 0.85), 0 0 16px rgba(0, 0, 0, 0.5)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        display: 'none',
      })
      labelContainer.appendChild(el)
      this._labelElements.set(stageId, el)
    })

    this._mode = 'flow'
    this._inspectStage = 'stack'
    this._pointerDownPos = null

    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    renderer.domElement.addEventListener('pointerdown', this._onPointerDown)
    renderer.domElement.addEventListener('pointerup', this._onPointerUp)
    window.addEventListener('keydown', this._onKeyDown)

    this._unsubscribe = flowStore.subscribe(() => this._onStoreChange(flowStore.getSnapshot()))
  }

  // The choreography doesn't exist yet when this controller is constructed
  // (SceneManager.init() builds it after) — wired in once it does, so
  // inspection can ask which stages are actually still attached.
  setChoreography(choreography) {
    this._choreography = choreography
  }

  _isPresent(stageId) {
    return this._choreography?.isStagePresent(stageId) ?? true
  }

  // Currently-attached stage ids, in stack order. Falls back to all of them
  // if somehow none are present, so framing math never divides by nothing.
  _presentStageIds() {
    const all = [...this.stageGroups.keys()]
    const present = all.filter((id) => this._isPresent(id))
    return present.length > 0 ? present : all
  }

  // Index used for explode spacing: among PRESENT stages only, so a
  // jettisoned stage's slot collapses instead of leaving a gap sized for
  // hardware that isn't there anymore (matters mid-flight; with the full
  // stack present this is identical to stack order).
  //
  // The whole layout is then re-centered on the present stack's CURRENT
  // midpoint (see _explodeShift), so the explosion expands outward in place
  // — the camera stays frozen on the mission view when inspect opens, and a
  // layout that only grew upward would walk half the vehicle out of frame.
  _rawExplodedY(stageId) {
    const presentIds = this._presentStageIds()
    const compactIndex = presentIds.indexOf(stageId)
    const index = compactIndex !== -1 ? compactIndex : [...this.stageGroups.keys()].indexOf(stageId)
    return this._stackY.get(stageId) + index * EXPLODE_GAP
  }

  _explodeShift() {
    const presentIds = this._presentStageIds()
    // Standing on the pad (countdown / ignition) the bottom stage is resting
    // on the ground, so it can't sink into it: anchor the lowest stage and let
    // everything above it spread upward instead of expanding about the middle.
    if (this._isOnGround()) {
      const lowest = (ys) => Math.min(...ys)
      return (
        lowest(presentIds.map((id) => this._rawExplodedY(id))) -
        lowest(presentIds.map((id) => this._stackY.get(id)))
      )
    }
    const mid = (ys) => (Math.min(...ys) + Math.max(...ys)) / 2
    const collapsedMid = mid(presentIds.map((id) => this._stackY.get(id)))
    const explodedMid = mid(presentIds.map((id) => this._rawExplodedY(id)))
    return explodedMid - collapsedMid
  }

  // Phases 0 (countdown) and 1 (ignition) have the vehicle sitting on the pad.
  _isOnGround() {
    return this.flowStore.getSnapshot().flow.phase <= 1
  }

  _explodedY(stageId) {
    return this._rawExplodedY(stageId) - this._explodeShift()
  }

  _onStoreChange(state) {
    if (state.mode !== this._mode) {
      this._mode = state.mode
      this._applyMode(state.mode)
    }
    if (state.mode === 'inspect' && state.inspect.stage !== this._inspectStage) {
      this._inspectStage = state.inspect.stage
      this._applyInspectStage(state.inspect.stage)
    }
  }

  _applyMode(mode) {
    const isInspect = mode === 'inspect'
    this.controls.enabled = isInspect
    this._applyTouchAction(mode)
    this._labelContainer.style.display = isInspect ? 'block' : 'none'
    if (!isInspect) {
      this._inspectStage = 'stack'
      this._collapseToStack()
    }
  }

  // OrbitControls sets touch-action: none on the canvas as soon as it is
  // constructed, which on a phone made the full-screen hero swallow every
  // swipe — the page could no longer be scrolled down to the content. Only
  // inspect mode (where OrbitControls owns one-finger rotate and pinch zoom)
  // needs that; in flow mode vertical swipes scroll the page and horizontal
  // swipes are left to FreeLookControl's touch orbit.
  _applyTouchAction(mode) {
    this.renderer.domElement.style.touchAction = mode === 'inspect' ? 'none' : 'pan-y'
  }

  _applyInspectStage(stage) {
    const isolatedId = typeof stage === 'object' ? stage.isolated : null

    this.stageGroups.forEach((group, stageId) => {
      const wantVisible = !isolatedId || stageId === isolatedId
      group.visible = wantVisible && this._isPresent(stageId)
    })

    if (stage === 'stack') {
      this._collapseToStack()
    } else {
      this._explode()
    }

    this._updateOrbitTarget(isolatedId)
  }

  // Only an ISOLATE click retargets the orbit (an intentional "focus on this
  // stage"). Entering inspect / returning to the exploded overview leaves the
  // target wherever it is — the whole point of the frozen-view inspect entry
  // (SceneManager hands OrbitControls the current shot's look-target) is that
  // the camera never jumps on the user.
  _updateOrbitTarget(isolatedId) {
    if (!isolatedId) return
    const group = this.stageGroups.get(isolatedId)
    if (group) {
      this.controls.target
        .set(0, group.position.y, 0)
        .applyQuaternion(this.rocket.quaternion)
        .add(this.rocket.position)
    }
  }

  _explode() {
    this.stageGroups.forEach((group, stageId) => {
      this._startTransition(stageId, group.position.y, this._explodedY(stageId))
    })
  }

  _collapseToStack() {
    this.stageGroups.forEach((group, stageId) => {
      this._startTransition(stageId, group.position.y, this._stackY.get(stageId))
    })
  }

  _startTransition(stageId, fromY, toY) {
    this._transitions.set(stageId, { fromY, toY, start: performance.now() })
  }

  _findStageId(object) {
    let current = object
    while (current) {
      if (current.userData?.stageId) return current.userData.stageId
      current = current.parent
    }
    return null
  }

  _onPointerDown(event) {
    if (event.button !== 0) return
    this._pointerDownPos = { x: event.clientX, y: event.clientY }
  }

  _onPointerUp(event) {
    if (event.button !== 0 || !this._pointerDownPos) return
    const dx = event.clientX - this._pointerDownPos.x
    const dy = event.clientY - this._pointerDownPos.y
    this._pointerDownPos = null
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) return
    this._handleClick(event)
  }

  _onKeyDown(event) {
    if (event.key !== 'Escape') return
    if (this.flowStore.getSnapshot().mode !== 'inspect') return
    this.flowStore.setMode('flow')
  }

  _handleClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.rocket, true)
    const hitStageId = hits.length > 0 ? this._findStageId(hits[0].object) : null

    const { mode, inspect } = this.flowStore.getSnapshot()
    const stage = inspect.stage

    if (mode === 'flow' || stage === 'stack') {
      if (!hitStageId) return
      this.flowStore.setMode('inspect')
      this.flowStore.setInspectStage('exploded')
      return
    }

    // A click anywhere off the vehicle resumes the flight (same as Esc or
    // the HUD's Resume button) — the HUD's look-around guide promises it.
    if (!hitStageId) {
      this.flowStore.setMode('flow')
      return
    }

    if (stage === 'exploded' || hitStageId !== stage.isolated) {
      this.flowStore.setInspectStage({ isolated: hitStageId })
    }
  }

  update() {
    const now = performance.now()
    this._transitions.forEach((transition, stageId) => {
      const group = this.stageGroups.get(stageId)
      const t = Math.min((now - transition.start) / STAGE_TRANSITION_DURATION, 1)
      group.position.y =
        transition.fromY + (transition.toY - transition.fromY) * easeInOutCubic(t)
      if (t >= 1) this._transitions.delete(stageId)
    })

    if (this.controls.enabled) {
      this.controls.update()
      this._updateLabels()
    }
  }

  _updateLabels() {
    const { clientWidth, clientHeight } = this.renderer.domElement
    const worldPos = new THREE.Vector3()

    this.stageGroups.forEach((group, stageId) => {
      const el = this._labelElements.get(stageId)
      const line = this._leaderLines.get(stageId)
      const dot = this._anchorDots.get(stageId)
      const hide = () => {
        el.style.display = 'none'
        line.style.display = 'none'
        dot.style.display = 'none'
      }

      if (!group.visible) {
        hide()
        return
      }
      group.getWorldPosition(worldPos)
      worldPos.project(this.camera)

      if (worldPos.z > 1) {
        hide()
        return
      }

      const anchorX = (worldPos.x * 0.5 + 0.5) * clientWidth
      const anchorY = (1 - (worldPos.y * 0.5 + 0.5)) * clientHeight
      const { x: labelX, y: labelY, lineX } = this._placeLabel(el, anchorX, anchorY, clientWidth, clientHeight)

      el.style.transform = `translate(${labelX}px, ${labelY}px) translateY(-50%)`

      line.style.display = ''
      line.setAttribute('x1', anchorX)
      line.setAttribute('y1', anchorY)
      line.setAttribute('x2', lineX)
      line.setAttribute('y2', labelY)

      dot.style.display = ''
      dot.setAttribute('cx', anchorX)
      dot.setAttribute('cy', anchorY)
    })
  }

  // Keeps a callout's text fully on screen: it goes on whichever side of its
  // stage has room (right preferred), wraps onto more lines when neither side
  // fits it on one, and is finally clamped inside the screen margins.
  // Returns the text's left edge, its vertical centre and where the leader
  // line should stop.
  _placeLabel(el, anchorX, anchorY, width, height) {
    el.style.display = 'block'
    el.style.whiteSpace = 'nowrap'
    el.style.maxWidth = 'none'
    const natural = el.offsetWidth

    const offset = Math.min(LABEL_OFFSET_X, Math.max(28, width * 0.08))
    const rightRoom = width - LABEL_MARGIN - (anchorX + offset + LABEL_GAP)
    const leftRoom = anchorX - offset - LABEL_GAP - LABEL_MARGIN
    const onRight = rightRoom >= natural || rightRoom >= leftRoom
    const room = Math.max(onRight ? rightRoom : leftRoom, LABEL_MIN_WIDTH)
    const maxWidth = Math.min(room, width - 2 * LABEL_MARGIN)

    if (natural > maxWidth) {
      el.style.whiteSpace = 'normal'
      el.style.maxWidth = `${maxWidth}px`
    }
    const w = el.offsetWidth
    const h = el.offsetHeight

    let x = onRight ? anchorX + offset + LABEL_GAP : anchorX - offset - LABEL_GAP - w
    x = Math.min(Math.max(x, LABEL_MARGIN), width - LABEL_MARGIN - w)
    let y = anchorY + LABEL_OFFSET_Y
    y = Math.min(Math.max(y, LABEL_MARGIN + h / 2), height - LABEL_MARGIN - h / 2)

    const lineX = onRight ? x - LABEL_GAP : x + w + LABEL_GAP
    return { x, y, lineX }
  }

  dispose() {
    this._unsubscribe()
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('keydown', this._onKeyDown)
    this.controls.dispose()
    this._labelElements.forEach((el) => el.remove())
    this._svg.remove()
  }
}
