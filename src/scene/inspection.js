import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const EXPLODE_GAP = 15 // meters of extra spacing per stage boundary once exploded
const STAGE_TRANSITION_DURATION = 800 // ms
const CLICK_DRAG_THRESHOLD = 5 // px of pointer movement still counted as a click

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
    this._labelElements = new Map()
    stageGroups.forEach((group, stageId) => {
      const el = document.createElement('div')
      el.textContent = group.userData.label ?? stageId
      Object.assign(el.style, {
        position: 'absolute',
        padding: '2px 6px',
        background: 'rgba(6, 12, 20, 0.6)',
        border: '1px solid rgba(215, 244, 255, 0.25)',
        borderRadius: '3px',
        color: '#d7f4ff',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
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
      group.visible = !isolatedId || stageId === isolatedId
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
      if (group) this.controls.target.set(0, group.position.y, 0)
      return
    }
    const ys = [...this._stackY.values()]
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2
    this.controls.target.set(0, midY, 0)
  }

  _explode() {
    ;[...this.stageGroups.keys()].forEach((stageId, index) => {
      const group = this.stageGroups.get(stageId)
      const toY = this._stackY.get(stageId) + index * EXPLODE_GAP
      this._startTransition(stageId, group.position.y, toY)
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
      if (!group.visible) {
        el.style.display = 'none'
        return
      }
      group.getWorldPosition(worldPos)
      worldPos.project(this.camera)

      if (worldPos.z > 1) {
        el.style.display = 'none'
        return
      }

      const x = (worldPos.x * 0.5 + 0.5) * clientWidth
      const y = (1 - (worldPos.y * 0.5 + 0.5)) * clientHeight
      el.style.display = 'block'
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`
    })
  }

  dispose() {
    this._unsubscribe()
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('keydown', this._onKeyDown)
    this.controls.dispose()
    this._labelElements.forEach((el) => el.remove())
  }
}
