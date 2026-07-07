const STEP_COOLDOWN_MS = 400 // lockout after a step fires, so held/repeated keydowns advance one phase at a time
const MAX_PHASE = 9

// Space-bar -> flow.phase driver. Per the skill, only active when
// mode === 'flow' && flow.autoplayComplete === true (no space-stepping during
// countdown/autoplay or while inspecting the rocket). Forward-only: each
// press advances exactly one phase. Reads/writes state exclusively through
// flowStore, mirroring inspection.js.
export class SpaceStepper {
  constructor({ flowStore }) {
    this.flowStore = flowStore

    this._active = false
    this._locked = false
    this._lockTimeoutId = null

    this._onKeyDown = this._onKeyDown.bind(this)
    window.addEventListener('keydown', this._onKeyDown)

    this._unsubscribe = flowStore.subscribe(() => this._onStoreChange(flowStore.getSnapshot()))
    this._onStoreChange(flowStore.getSnapshot())
  }

  _onStoreChange(state) {
    this._active = state.mode === 'flow' && state.flow.autoplayComplete === true
  }

  _onKeyDown(event) {
    if (event.code !== 'Space') return
    if (!this._active) return
    event.preventDefault()
    if (this._locked) return

    this._step()
  }

  _step() {
    const { phase } = this.flowStore.getSnapshot().flow
    const nextPhase = Math.min(MAX_PHASE, phase + 1)
    if (nextPhase !== phase) this.flowStore.setPhase(nextPhase)

    this._locked = true
    this._lockTimeoutId = setTimeout(() => {
      this._locked = false
    }, STEP_COOLDOWN_MS)
  }

  dispose() {
    this._unsubscribe()
    window.removeEventListener('keydown', this._onKeyDown)
    clearTimeout(this._lockTimeoutId)
  }
}
