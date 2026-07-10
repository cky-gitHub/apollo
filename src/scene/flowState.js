// State shape for the flow/inspect scene mode, plus a small subscribable
// store on top of it. No key listener here (out of scope for now) — the
// only built-in driver is the phase-0 countdown ticker described below.

export function createFlowState() {
  return {
    mode: 'flow', // 'flow' | 'inspect'
    flow: {
      phase: 0, // 0-13, discrete step
      // False until the real T-10 countdown (LaunchSequence, auto-started by
      // SceneManager.init()) ticks down and flips it — see MissionAutoplay,
      // which then carries phases 1-13 the rest of the way by itself.
      autoplayComplete: false,
    },
    inspect: {
      stage: 'stack', // 'stack' | 'exploded' | { isolated: stageId }
    },
  }
}

const COUNTDOWN_START_SECONDS = 10

// Ticks the phase-0 countdown down to 0 once per second, then flips
// autoplayComplete — the signal that (per the skill) unlocks the space-bar
// stepper elsewhere. Exposes a useSyncExternalStore-compatible
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

  // Marks autoplay done outside the countdown ticker — used when the staging
  // choreography takes over from an interrupted countdown/liftoff (test-rig
  // phase jump), so the space stepper doesn't stay locked forever.
  completeAutoplay() {
    if (this.state.flow.autoplayComplete) return
    this.state = {
      ...this.state,
      flow: { ...this.state.flow, autoplayComplete: true },
    }
    this._emit()
  }

  // Restarts the phase-0 countdown from T-10 — used by an on-demand launch
  // sequence to (re)trigger a real countdown rather than relying on the
  // default autoplayComplete: true scaffolding.
  resetCountdown() {
    this.countdownSeconds = COUNTDOWN_START_SECONDS
    this.state = {
      ...this.state,
      flow: { ...this.state.flow, phase: 0, autoplayComplete: false },
    }
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
