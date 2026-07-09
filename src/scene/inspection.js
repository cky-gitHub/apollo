import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const EXPLODE_GAP = 15 // meters of extra spacing per stage boundary once exploded
const STAGE_TRANSITION_DURATION = 800 // ms
const CLICK_DRAG_THRESHOLD = 5 // px of pointer movement still counted as a click
const FRAMING_PADDING = 30 // m, so a single remaining stage still gets a non-zero span to frame
const MIN_FRAMING_SCALE = 0.2 // floor so framing never zooms in absurdly close
const SVG_NS = 'http://www.w3.org/2000/svg'
const LABEL_OFFSET_X = 110 // px, callout sits this far to the side of its stage's screen anchor
const LABEL_OFFSET_Y = -6 // px

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
    this.controls.maxDistance = 260

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
        fontSize: '16px',
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
  _explodedY(stageId) {
    const presentIds = this._presentStageIds()
    const compactIndex = presentIds.indexOf(stageId)
    const index = compactIndex !== -1 ? compactIndex : [...this.stageGroups.keys()].indexOf(stageId)
    return this._stackY.get(stageId) + index * EXPLODE_GAP
  }

  // World-space midpoint of the currently-attached stack's EXPLODED layout
  // (not a fixed pad spot, and not the collapsed stack Y either — the
  // camera/orbit-target framing is tuned for the exploded overview, which
  // is where a fresh click-to-inspect always lands). The rocket may be
  // mid-flight and tilted, so this rides its current transform the same way
  // cameraPath.js's rocket-frame poses do.
  getFocusWorldPosition(target = new THREE.Vector3()) {
    const ys = this._presentStageIds().map((id) => this._explodedY(id))
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2
    return target
      .set(0, midY, 0)
      .applyQuaternion(this.rocket.quaternion)
      .add(this.rocket.position)
  }

  // How much of the fully-exploded stack's vertical span the currently-
  // present stages cover, as a 0-1 scale — so the inspect camera zooms in
  // when little of the vehicle remains (e.g. just the LM, late in the
  // mission) instead of framing empty space sized for the whole stack.
  getFramingScale() {
    const allIds = [...this.stageGroups.keys()]
    const presentYs = this._presentStageIds().map((id) => this._explodedY(id))
    const allYs = allIds.map((id) => this._explodedY(id))
    const presentSpan = Math.max(...presentYs) - Math.min(...presentYs)
    const fullSpan = Math.max(...allYs) - Math.min(...allYs)
    const scale = (presentSpan + FRAMING_PADDING) / (fullSpan + FRAMING_PADDING)
    return THREE.MathUtils.clamp(scale, MIN_FRAMING_SCALE, 1)
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
    this._labelContainer.style.display = isInspect ? 'block' : 'none'
    if (!isInspect) {
      this._inspectStage = 'stack'
      this._collapseToStack()
    }
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

  _updateOrbitTarget(isolatedId) {
    if (isolatedId) {
      const group = this.stageGroups.get(isolatedId)
      if (group) {
        this.controls.target
          .set(0, group.position.y, 0)
          .applyQuaternion(this.rocket.quaternion)
          .add(this.rocket.position)
      }
      return
    }
    this.getFocusWorldPosition(this.controls.target)
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

    if (stage === 'exploded') {
      this.flowStore.setInspectStage(hitStageId ? { isolated: hitStageId } : 'stack')
      return
    }

    // isolated
    if (hitStageId && hitStageId !== stage.isolated) {
      this.flowStore.setInspectStage({ isolated: hitStageId })
    } else if (!hitStageId) {
      this.flowStore.setInspectStage('exploded')
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
      const labelX = anchorX + LABEL_OFFSET_X
      const labelY = anchorY + LABEL_OFFSET_Y

      el.style.display = 'block'
      el.style.transform = `translate(8px, -50%) translate(${labelX}px, ${labelY}px)`

      line.style.display = ''
      line.setAttribute('x1', anchorX)
      line.setAttribute('y1', anchorY)
      line.setAttribute('x2', labelX)
      line.setAttribute('y2', labelY)

      dot.style.display = ''
      dot.setAttribute('cx', anchorX)
      dot.setAttribute('cy', anchorY)
    })
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
