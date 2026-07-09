const AZIMUTH_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaX px (two-finger trackpad drag)
const POLAR_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaY px
const AZIMUTH_DRAG_SENSITIVITY = 0.006 // rad per pointer px, alt-drag
const POLAR_DRAG_SENSITIVITY = 0.006

// Look-around available at all times, in both flow and inspect mode: a
// two-finger trackpad drag (reported by the browser as a non-ctrl wheel
// event) or an Alt+left-mouse drag orbits the camera. In flow mode the
// deltas feed cameraPath.js's `orbit` param, layered on top of the scripted
// pose (see SceneManager._updateCamera). In inspect mode, SceneManager
// instead rotates the OrbitControls camera directly around its target,
// using the same orbitOffset() math.
//
// Inspect mode's OrbitControls already owns plain left-drag (rotate) and
// wheel (zoom) — this control deliberately takes over the NON-ctrl wheel
// gesture for orbit instead (pinch-zoom, ctrlKey wheel, is left alone for
// zoom), and Alt+drag is a gesture OrbitControls never uses. Both handlers
// call stopImmediatePropagation() so OrbitControls' own listeners (attached
// later, same element) don't also react to the same event — see the calls
// below. Reads mode from flowStore; never touches it.
export class FreeLookControl {
  constructor({ domElement, flowStore, onOrbit }) {
    this.domElement = domElement
    this.flowStore = flowStore
    this.onOrbit = onOrbit

    this._active = false
    this._dragging = false
    this._lastX = 0
    this._lastY = 0

    this._onWheel = this._onWheel.bind(this)
    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)

    domElement.addEventListener('wheel', this._onWheel, { passive: false })
    domElement.addEventListener('pointerdown', this._onPointerDown)
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)

    this._unsubscribe = flowStore.subscribe(() => this._onStoreChange(flowStore.getSnapshot()))
    this._onStoreChange(flowStore.getSnapshot())
  }

  _onStoreChange(state) {
    this._active = state.mode === 'flow' || state.mode === 'inspect'
    if (!this._active) this._dragging = false
  }

  _onWheel(event) {
    if (!this._active || event.ctrlKey) return // ctrlKey => pinch-zoom gesture, not a two-finger pan
    event.preventDefault()
    event.stopImmediatePropagation() // don't let OrbitControls also treat this as a zoom
    this.onOrbit(event.deltaX * AZIMUTH_WHEEL_SENSITIVITY, event.deltaY * POLAR_WHEEL_SENSITIVITY)
  }

  _onPointerDown(event) {
    if (!this._active || !event.altKey || event.button !== 0) return
    event.preventDefault()
    event.stopImmediatePropagation() // don't let OrbitControls also start its own drag-rotate
    this._dragging = true
    this._lastX = event.clientX
    this._lastY = event.clientY
  }

  _onPointerMove(event) {
    if (!this._dragging) return
    if (!this._active) {
      this._dragging = false
      return
    }
    const dx = event.clientX - this._lastX
    const dy = event.clientY - this._lastY
    this._lastX = event.clientX
    this._lastY = event.clientY
    // Same sign convention as the trackpad wheel mapping above — verified
    // against feel, not just theory: an inverted version of this shipped
    // first and tested backwards on both axes.
    this.onOrbit(dx * AZIMUTH_DRAG_SENSITIVITY, dy * POLAR_DRAG_SENSITIVITY)
  }

  _onPointerUp() {
    this._dragging = false
  }

  dispose() {
    this._unsubscribe()
    this.domElement.removeEventListener('wheel', this._onWheel)
    this.domElement.removeEventListener('pointerdown', this._onPointerDown)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
  }
}
