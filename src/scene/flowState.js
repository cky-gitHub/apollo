// State shape for the flow/inspect scene mode, plus a small subscribable
// store on top of it. No scroll listener here (out of scope for now) — the
// only built-in driver is the phase-0 countdown ticker described below.

export function createFlowState() {
  return {
    mode: 'flow', // 'flow' | 'inspect'
    flow: {
      phase: 0, // 0-9, discrete step
      // TEMP: defaults true so scroll-stepper works immediately for testing,
      // before the countdown/liftoff sequence exists to flip it for real.
      // Flip this back to false once that sequence lands.
      autoplayComplete: true,
    },
    inspect: {
      stage: 'stack', // 'stack' | 'exploded' | { isolated: stageId }
    },
  }
}

const COUNTDOWN_START_SECONDS = 10

// Ticks the phase-0 countdown down to 0 once per second, then flips
// autoplayComplete — the signal that (per the skill) unlocks the scroll
// listener elsewhere. Exposes a useSyncExternalStore-compatible
// subscribe/getSnapshot pair for React consumers (see Hud.jsx).
export class FlowStore {
  constructor() {
    this.state = createFlowState()
    this.countdownSeconds = COUNTDOWN_START_SECONDS
    this._listeners = new Set()
    this._intervalId = null
    this._snapshot = this._buildSnapshot()
  }

  subscribe = (listener) => {
    this._listeners.add(listener)
    if (this._listeners.size === 1) this._startTicking()
    return () => {
      this._listeners.delete(listener)
      if (this._listeners.size === 0) this._stopTicking()
    }
  }

  getSnapshot = () => this._snapshot

  setPhase(phase) {
    this.state = { ...this.state, flow: { ...this.state.flow, phase } }
    this._emit()
  }

  setMode(mode) {
    this.state = { ...this.state, mode }
    this._emit()
  }

  setInspectStage(stage) {
    this.state = { ...this.state, inspect: { ...this.state.inspect, stage } }
    this._emit()
  }

  _buildSnapshot() {
    return { ...this.state, countdownSeconds: this.countdownSeconds }
  }

  _startTicking() {
    this._intervalId = setInterval(() => {
      const { phase, autoplayComplete } = this.state.flow
      if (phase !== 0 || autoplayComplete) return

      this.countdownSeconds = Math.max(0, this.countdownSeconds - 1)
      if (this.countdownSeconds === 0) {
        this.state = {
          ...this.state,
          flow: { ...this.state.flow, autoplayComplete: true },
        }
      }
      this._emit()
    }, 1000)
  }

  _stopTicking() {
    clearInterval(this._intervalId)
    this._intervalId = null
  }

  _emit() {
    this._snapshot = this._buildSnapshot()
    this._listeners.forEach((listener) => listener())
  }
}
