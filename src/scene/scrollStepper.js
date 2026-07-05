const SCROLL_THRESHOLD = 120 // accumulated wheel deltaY (px-equivalent) to trigger one phase step
const STEP_COOLDOWN_MS = 400 // lockout after a step fires, so one gesture advances exactly one phase
const MIN_PHASE = 0
const MAX_PHASE = 9

// Debounced wheel -> flow.phase driver. Per the skill, only active when
// mode === 'flow' && flow.autoplayComplete === true (no scroll during
// countdown/autoplay or while inspecting the rocket). Reads/writes state
// exclusively through flowStore, mirroring inspection.js.
export class ScrollStepper {
  constructor({ flowStore }) {
    this.flowStore = flowStore

    this._active = false
    this._accumulated = 0
    this._locked = false
    this._lockTimeoutId = null

    this._onWheel = this._onWheel.bind(this)
    window.addEventListener('wheel', this._onWheel, { passive: false })

    this._unsubscribe = flowStore.subscribe(() => this._onStoreChange(flowStore.getSnapshot()))
    this._onStoreChange(flowStore.getSnapshot())
  }

  _onStoreChange(state) {
    this._active = state.mode === 'flow' && state.flow.autoplayComplete === true
    if (!this._active) this._accumulated = 0
  }

  _onWheel(event) {
    if (!this._active) return
    event.preventDefault()
    if (this._locked) return

    this._accumulated += event.deltaY
    if (Math.abs(this._accumulated) < SCROLL_THRESHOLD) return

    const direction = this._accumulated > 0 ? 1 : -1
    this._accumulated = 0
    this._step(direction)
  }

  _step(direction) {
    const { phase } = this.flowStore.getSnapshot().flow
    const nextPhase = Math.min(MAX_PHASE, Math.max(MIN_PHASE, phase + direction))
    if (nextPhase !== phase) this.flowStore.setPhase(nextPhase)

    this._locked = true
    this._lockTimeoutId = setTimeout(() => {
      this._locked = false
    }, STEP_COOLDOWN_MS)
  }

  dispose() {
    this._unsubscribe()
    window.removeEventListener('wheel', this._onWheel)
    clearTimeout(this._lockTimeoutId)
  }
}
