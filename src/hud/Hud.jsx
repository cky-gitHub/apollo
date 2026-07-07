import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PHASES } from '../data/phases.js'
import './Hud.css'

const MAX_PHASE = PHASES.length - 1

function pad(value, width) {
  return String(Math.max(0, Math.trunc(value))).padStart(width, '0')
}

// hh:mm:ss, for both the T- countdown and the T+ mission-elapsed clock.
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.trunc(totalSeconds))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}`
}

// Mission clock: T- counts down pre-liftoff (driven by flowStore's own
// countdown ticker), T+ counts up from the moment autoplayComplete flips —
// tracked locally so this is a display-only concern, not new flow state.
function useMissionClock(autoplayComplete, countdownSeconds) {
  const liftoffAtRef = useRef(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (autoplayComplete) {
      if (liftoffAtRef.current === null) liftoffAtRef.current = Date.now()
    } else {
      // Cleared (not just left alone) so a re-armed countdown (LaunchSequence
      // restarting via resetCountdown) captures a fresh liftoff time on its
      // next true transition, instead of reusing a stale one from earlier.
      liftoffAtRef.current = null
    }
  }, [autoplayComplete])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!autoplayComplete) {
    return { prefix: 'T-', text: formatClock(Math.ceil(countdownSeconds)) }
  }
  const elapsedSeconds = liftoffAtRef.current ? (nowMs - liftoffAtRef.current) / 1000 : 0
  return { prefix: 'T+', text: formatClock(elapsedSeconds) }
}

function Hud({ flowStore }) {
  const state = useSyncExternalStore(flowStore.subscribe, flowStore.getSnapshot)
  const phase = PHASES[state.flow.phase] ?? PHASES[0]
  const clock = useMissionClock(state.flow.autoplayComplete, state.countdownSeconds)
  const velocityKmh = Math.round(phase.velocity * 3.6)

  return (
    <div className="hud-root">
      <div className="hud-scanlines" aria-hidden="true" />

      <div className="hud-module hud-status">
        <div className="hud-label">Phase</div>
        <div className="hud-value hud-value--lg">{phase.name}</div>
        <div className="hud-substat">
          <span className="hud-go-dot" aria-hidden="true" />
          Step {pad(state.flow.phase, 2)}/{pad(MAX_PHASE, 2)} — Go
        </div>
      </div>

      <div className="hud-module hud-clock">
        <div className="hud-label">Met</div>
        <div className="hud-value hud-value--lg">
          {clock.prefix}
          {clock.text}
        </div>
      </div>

      <div className="hud-cluster hud-telemetry">
        <div className="hud-module">
          <div className="hud-label">Alt</div>
          <div className="hud-value">{pad(Math.round(phase.altitude), 4)} km</div>
        </div>
        <div className="hud-module">
          <div className="hud-label">Vel</div>
          <div className="hud-value">{pad(velocityKmh, 5)} km/h</div>
        </div>
      </div>
    </div>
  )
}

export default Hud
