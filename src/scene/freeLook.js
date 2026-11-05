const AZIMUTH_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaX px (two-finger trackpad drag)
const POLAR_WHEEL_SENSITIVITY = 0.0025 // rad per wheel deltaY px
const AZIMUTH_DRAG_SENSITIVITY = 0.006 // rad per pointer px, alt-drag
const POLAR_DRAG_SENSITIVITY = 0.006
const AZIMUTH_TOUCH_SENSITIVITY = 0.008 // rad per finger px, one-finger horizontal swipe (flow mode)

// Look-around available at all times, in both flow and inspect mode: a
// two-finger trackpad drag (reported by the browser as a non-ctrl wheel
// event), a plain left-mouse drag (flow mode) or an Alt+left-mouse drag
// (either mode) orbits the camera. In flow mode the
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
//
// On a phone, a one-finger horizontal swipe orbits the camera in flow mode.
// It is horizontal only: the canvas is touch-action: pan-y there (see
// InspectionController._applyTouchAction), so vertical swipes still scroll
// the page down to the site content. In inspect mode OrbitControls handles
// touch itself (one-finger rotate, pinch zoom), so this stays out of it.
export class FreeLookControl {
  constructor({ domElement, flowStore, onOrbit }) {
    this.domElement = domElement
    this.flowStore = flowStore
    this.onOrbit = onOrbit

    this._active = false
    this._dragging = false
    this._touchDragging = false
    this._mode = 'flow'
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
    window.addEventListener('pointercancel', this._onPointerUp)

    this._unsubscribe = flowStore.subscribe(() => this._onStoreChange(flowStore.getSnapshot()))
    this._onStoreChange(flowStore.getSnapshot())
  }

  _onStoreChange(state) {
    this._active = state.mode === 'flow' || state.mode === 'inspect'
    this._mode = state.mode
    if (!this._dragging) this._setCursor(state.mode === 'flow' ? 'grab' : '')
    if (!this._active) this._dragging = false
    if (state.mode !== 'flow') this._touchDragging = false
  }

  _onWheel(event) {
    if (!this._active || event.ctrlKey) return // ctrlKey => pinch-zoom gesture, not a two-finger pan
    event.preventDefault()
    event.stopImmediatePropagation() // don't let OrbitControls also treat this as a zoom
    this.onOrbit(event.deltaX * AZIMUTH_WHEEL_SENSITIVITY, event.deltaY * POLAR_WHEEL_SENSITIVITY)
  }

  _onPointerDown(event) {
    if (event.pointerType === 'touch') {
      if (this._mode !== 'flow' || !event.isPrimary) return
      this._touchDragging = true
      this._lastX = event.clientX
      return
    }
    if (!this._active || event.button !== 0) return
    // Flow mode: a plain click-and-drag looks around. It must NOT swallow
    // the event — inspection.js needs the same pointerdown to tell a click
    // on the rocket (inspect) from a drag (look around, > 5 px of travel).
    // Inspect mode: plain drag belongs to OrbitControls, so only Alt+drag
    // is ours there, and OrbitControls must not also react to it.
    if (this._mode === 'inspect') {
      if (!event.altKey) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    this._dragging = true
    this._setCursor('grabbing')
    this._lastX = event.clientX
    this._lastY = event.clientY
  }

  _onPointerMove(event) {
    if (this._touchDragging && event.pointerType === 'touch' && event.isPrimary) {
      const dx = event.clientX - this._lastX
      this._lastX = event.clientX
      // Negated: the scene follows the finger (swipe right turns the rocket
      // right), the same grab feel as OrbitControls' own drag-rotate.
      this.onOrbit(-dx * AZIMUTH_TOUCH_SENSITIVITY, 0)
      return
    }
    if (!this._dragging) return
    if (!this._active) {
      this._dragging = false
      return
    }
    const dx = event.clientX - this._lastX
    const dy = event.clientY - this._lastY
    this._lastX = event.clientX
    this._lastY = event.clientY
    // Both axes are negated so the scene follows the pointer (drag right
    // turns the rocket right, drag up tilts it up), matching the touch swipe
    // and OrbitControls' drag-rotate; un-negated, each axis read inverted.
    this.onOrbit(-dx * AZIMUTH_DRAG_SENSITIVITY, -dy * POLAR_DRAG_SENSITIVITY)
  }

  _onPointerUp() {
    if (this._dragging) this._setCursor(this._mode === 'flow' ? 'grab' : '')
    this._dragging = false
    this._touchDragging = false
  }

  _setCursor(cursor) {
    this.domElement.style.cursor = cursor
  }

  dispose() {
    this._unsubscribe()
    this.domElement.removeEventListener('wheel', this._onWheel)
    this.domElement.removeEventListener('pointerdown', this._onPointerDown)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('pointercancel', this._onPointerUp)
  }
}
