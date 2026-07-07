// TEMP: test rig — remove before ship.
// Keyboard override + debug readout for exercising flow.phase transitions
// before the full staging sequence exists to drive them for real. Arrow
// keys jump phases directly and bypass the autoplayComplete gate that
// scrollStepper.js respects, so any phase can be reached immediately. 'L'
// (re)triggers the real countdown/liftoff LaunchSequence from T-10, once
// wired via setLaunchSequence(). Delete this file plus its wiring in
// SceneManager.js once the real sequences land.
import { PHASES } from '../data/phases.js'

const MIN_PHASE = 0
const MAX_PHASE = 9

export class PhaseTestRig {
  constructor({ flowStore }) {
    this.flowStore = flowStore
    this.launchSequence = null
    this._debugEl = null

    this._onKeyDown = this._onKeyDown.bind(this)
    window.addEventListener('keydown', this._onKeyDown)

    this._unsubscribe = flowStore.subscribe(() => this._updateDebugReadout())
  }

  // The launch sequence is only constructed once the rocket has loaded
  // (SceneManager.init(), which resolves after this rig already exists), so
  // it's wired in after the fact rather than passed to the constructor.
  setLaunchSequence(launchSequence) {
    this.launchSequence = launchSequence
  }

  _onKeyDown(event) {
    if (event.key === 'ArrowRight') {
      this._step(1)
    } else if (event.key === 'ArrowLeft') {
      this._step(-1)
    } else if (event.key.toLowerCase() === 'i') {
      this._toggleDebug()
    } else if (event.key.toLowerCase() === 'l') {
      this.launchSequence?.start()
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
      `autoplayComplete: ${flow.autoplayComplete}\n` +
      `launch: ${this.launchSequence?.stage ?? 'n/a'} (press L)`
  }

  dispose() {
    this._unsubscribe()
    window.removeEventListener('keydown', this._onKeyDown)
    if (this._debugEl) this._debugEl.remove()
  }
}
