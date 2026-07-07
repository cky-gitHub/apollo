const AZIMUTH_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaX px (two-finger trackpad drag)
const POLAR_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaY px
const AZIMUTH_DRAG_SENSITIVITY = 0.006 // rad per pointer px, alt-drag
const POLAR_DRAG_SENSITIVITY = 0.006

// Look-around available at all times in flow mode: a two-finger trackpad
// drag (reported by the browser as a non-ctrl wheel event) or an
// Alt+left-mouse drag orbits the camera around the current phase's focus
// point — see the `orbit` param resolvePoseWorld takes in cameraPath.js for
// how these deltas get layered on top of the scripted pose. Inspect mode
// already has its own OrbitControls-driven orbit (inspection.js, plain
// left-drag + wheel-zoom), so this stays flow-only to avoid double-handling
// the same input there. Reads mode from flowStore; never touches it.
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
    this._active = state.mode === 'flow'
    if (!this._active) this._dragging = false
  }

  _onWheel(event) {
    if (!this._active || event.ctrlKey) return // ctrlKey => pinch-zoom gesture, not a two-finger pan
    event.preventDefault()
    this.onOrbit(event.deltaX * AZIMUTH_WHEEL_SENSITIVITY, event.deltaY * POLAR_WHEEL_SENSITIVITY)
  }

  _onPointerDown(event) {
    if (!this._active || !event.altKey || event.button !== 0) return
    event.preventDefault()
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
