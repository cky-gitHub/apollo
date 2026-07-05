// TEMP: test rig — remove before ship.
// Keyboard override + debug readout for exercising flow.phase transitions
// before the countdown/liftoff/staging sequences exist to drive them for
// real. Arrow keys jump phases directly and bypass the autoplayComplete
// gate that scrollStepper.js respects, so any phase can be reached
// immediately. Delete this file plus its two wiring lines in
// SceneManager.js once the real sequences land.
import { PHASES } from '../data/phases.js'

const MIN_PHASE = 0
const MAX_PHASE = 9

export class PhaseTestRig {
  constructor({ flowStore }) {
    this.flowStore = flowStore
    this._debugEl = null

    this._onKeyDown = this._onKeyDown.bind(this)
    window.addEventListener('keydown', this._onKeyDown)

    this._unsubscribe = flowStore.subscribe(() => this._updateDebugReadout())
  }

  _onKeyDown(event) {
    if (event.key === 'ArrowRight') {
      this._step(1)
    } else if (event.key === 'ArrowLeft') {
      this._step(-1)
    } else if (event.key.toLowerCase() === 'i') {
      this._toggleDebug()
    }
  }

  _step(direction) {
    const { phase } = this.flowStore.getSnapshot().flow
    const nextPhase = Math.min(MAX_PHASE, Math.max(MIN_PHASE, phase + direction))
    if (nextPhase !== phase) this.flowStore.setPhase(nextPhase)
  }

  _toggleDebug() {
    if (this._debugEl) {
      this._debugEl.remove()
      this._debugEl = null
      return
    }
    this._debugEl = document.createElement('div')
    Object.assign(this._debugEl.style, {
      position: 'fixed',
      top: '1.25rem',
      right: '1.25rem',
      zIndex: '999',
      padding: '0.5em 0.8em',
      background: 'rgba(180, 20, 20, 0.85)',
      color: '#fff',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '12px',
      lineHeight: '1.4',
      whiteSpace: 'pre',
      pointerEvents: 'none',
    })
    document.body.appendChild(this._debugEl)
    this._updateDebugReadout()
  }

  _updateDebugReadout() {
    if (!this._debugEl) return
    const { mode, flow } = this.flowStore.getSnapshot()
    const phaseInfo = PHASES[flow.phase] ?? PHASES[0]
    this._debugEl.textContent =
      `DEBUG (temp)\n` +
      `mode: ${mode}\n` +
      `phase: ${flow.phase} — ${phaseInfo.name}\n` +
      `autoplayComplete: ${flow.autoplayComplete}`
  }

  dispose() {
    this._unsubscribe()
    window.removeEventListener('keydown', this._onKeyDown)
    if (this._debugEl) this._debugEl.remove()
  }
}
