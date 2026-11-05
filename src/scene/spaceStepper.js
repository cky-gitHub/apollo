import { MAX_PHASE } from '../data/phases.js'

const STEP_COOLDOWN_MS = 400 // lockout after a step fires, so held/repeated keydowns advance one phase at a time

// Space-bar driver. Before launch, Space presses Launch (onLaunch — a no-op
// until the vehicle is loaded). After that it steps flow.phase, only while
// mode === 'flow' && flow.autoplayComplete === true (no space-stepping during
// the countdown or while inspecting the rocket). Forward-only: each press
// advances exactly one phase. Reads/writes state exclusively through
// flowStore, mirroring inspection.js. A Space press on a focused button is
// left to the button itself, so the HUD's own buttons never double-fire.
export class SpaceStepper {
  constructor({ flowStore, onLaunch }) {
    this.flowStore = flowStore
    this.onLaunch = onLaunch

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
    const tag = event.target?.tagName
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return
    const { mode, flow } = this.flowStore.getSnapshot()
    if (mode === 'flow' && !flow.launched && window.scrollY < window.innerHeight * 0.5) {
      event.preventDefault()
      if (!event.repeat) this.onLaunch?.()
      return
    }
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
