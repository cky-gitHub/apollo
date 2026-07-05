import { useSyncExternalStore } from 'react'
import { PHASES } from '../data/phases.js'
import './Hud.css'

function Hud({ flowStore }) {
  const state = useSyncExternalStore(flowStore.subscribe, flowStore.getSnapshot)
  const phase = PHASES[state.flow.phase] ?? PHASES[0]

  const showCountdown = state.flow.phase === 0 && !state.flow.autoplayComplete

  return (
    <div className="hud-root">
      <div className="hud-phase">
        <span className="hud-label">PHASE</span>
        <span className="hud-value">
          {state.flow.phase} — {phase.name}
        </span>
      </div>

      <div className="hud-countdown">
        <span className="hud-label">T-</span>
        <span className="hud-value">
          {showCountdown ? Math.ceil(state.countdownSeconds) : '00'}
        </span>
      </div>

      <div className="hud-telemetry">
        <span className="hud-label">TELEMETRY</span>
        <span className="hud-value">ALT {phase.altitude.toFixed(1)} km</span>
        <span className="hud-value">VEL {phase.velocity.toFixed(0)} m/s</span>
      </div>
    </div>
  )
}

export default Hud
