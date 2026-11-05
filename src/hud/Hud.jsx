import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PHASES, MAX_PHASE } from '../data/phases.js'
import './Hud.css'

// Interpolates the telemetry anchors of two phases. Distances go in log
// space (log of 1 + km), like the scene's own distance compression, so the
// readout shrinks at the same rate Earth/the Moon visibly grow.
function lerp(a, b, t) {
  return a + (b - a) * t
}

function logLerp(a, b, t) {
  return Math.exp(lerp(Math.log1p(a), Math.log1p(b), t)) - 1
}

function telemetryAt(from, to, t) {
  const a = PHASES[from] ?? to
  return {
    met: lerp(a.met, to.met, t),
    velocityMs: lerp(a.velocityMs, to.velocityMs, t),
    distEarthKm: logLerp(a.distEarthKm, to.distEarthKm, t),
    distMoonKm: logLerp(a.distMoonKm, to.distMoonKm, t),
  }
}

// Live telemetry, spooled on the scene's own clock: StagingChoreography
// publishes flowStore.telemetry = { from, to, t } every frame, where t is
// the current beat's progress through the motion the viewer is watching
// (Earth/Moon distance, the burn). Reading it per animation frame keeps the
// numbers in step with the picture — a fixed timer from the phase change
// used to show "0 km from Earth" while Earth was still a distant dot.
function useTelemetry(flowStore, phaseIndex) {
  const read = () => {
    const live = flowStore.telemetry
    const to = PHASES[phaseIndex] ?? PHASES[0]
    if (!live || live.to !== phaseIndex) return telemetryAt(phaseIndex, to, 1)
    return telemetryAt(live.from, to, live.t)
  }
  const [values, setValues] = useState(read)
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    let frameId
    let last = null
    const tick = () => {
      const next = readRef.current()
      if (
        !last ||
        Math.round(next.met) !== Math.round(last.met) ||
        Math.abs(next.velocityMs - last.velocityMs) > 0.05 ||
        Math.abs(next.distEarthKm - last.distEarthKm) > 0.01 ||
        Math.abs(next.distMoonKm - last.distMoonKm) > 0.01
      ) {
        last = next
        setValues(next)
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [flowStore])

  return values
}

// Ground Elapsed Time in NASA's 000:00:00 form (hours can pass 100 on an
// 8-day mission — three digits is the authentic width).
function formatGet(totalSeconds) {
  const sign = totalSeconds < 0 ? '-' : '+'
  const s = Math.round(Math.abs(totalSeconds))
  const hh = String(Math.floor(s / 3600)).padStart(3, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${sign}${hh}:${mm}:${ss}`
}

function formatKm(km) {
  if (km < 10) return km.toFixed(1)
  return Math.round(km).toLocaleString('en-US')
}

// Phones and tablets: no keyboard, so the HUD swaps its key hints (SPACE,
// ESC) for tap buttons that do the same thing.
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

function subscribeTouch(onChange) {
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useIsTouch() {
  return useSyncExternalStore(
    subscribeTouch,
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false,
  )
}

// What the bottom-right control shows. `action` is set when it is something
// to press (a button on touch, a button or key on desktop); `keys` is the
// desktop keyboard shortcut for it, if any.
function hintFor(state, ready) {
  if (state.mode === 'inspect') {
    return { keys: 'ESC', action: 'resume', label: 'Resume flight' }
  }
  if (!state.flow.launched) {
    return ready
      ? { keys: null, action: 'launch', label: 'Launch' }
      : { keys: null, action: null, label: 'Preparing vehicle…' }
  }
  if (!state.flow.autoplayComplete) {
    return { keys: null, action: null, label: 'Auto sequence running' }
  }
  if (state.flow.phase >= MAX_PHASE) {
    return { keys: null, action: null, label: 'Mission complete · Crew recovered' }
  }
  return { keys: 'SPACE', action: 'next', label: `Next · ${PHASES[state.flow.phase + 1].name}` }
}

function Hud({ flowStore, ready = false, onLaunch }) {
  const state = useSyncExternalStore(flowStore.subscribe, flowStore.getSnapshot)
  const phase = PHASES[state.flow.phase] ?? PHASES[0]

  const inCountdown = state.flow.phase === 0 && !state.flow.autoplayComplete
  const telemetry = useTelemetry(flowStore, state.flow.phase)
  const met = telemetry.met
  const velocityKmh = telemetry.velocityMs * 3.6
  const distEarth = telemetry.distEarthKm
  const distMoon = telemetry.distMoonKm

  const isTouch = useIsTouch()
  const hint = hintFor(state, ready)

  const runAction = () => {
    if (hint.action === 'launch') onLaunch?.()
    else if (hint.action === 'resume') flowStore.setMode('flow')
    else if (hint.action === 'next') flowStore.setPhase(Math.min(MAX_PHASE, state.flow.phase + 1))
  }

  // Launch is always a button. The other actions are a button on touch
  // screens and a keyboard hint (SPACE / ESC) on desktop.
  const asButton = hint.action === 'launch' || (isTouch && hint.action)

  return (
    <div className="hud-root">
      <header className="hud-phase">
        <div className="hud-label">
          Mission phase {String(state.flow.phase).padStart(2, '0')}
          <span className="hud-label-dim"> / {String(MAX_PHASE).padStart(2, '0')}</span>
        </div>
        <h1 className="hud-phase-name">{phase.name}</h1>
        <div className="hud-phase-detail">{phase.detail}</div>
      </header>

      <div className="hud-clock">
        <div className="hud-label">Ground elapsed time</div>
        <div className="hud-clock-value">
          {inCountdown ? `-000:00:${String(state.countdownSeconds).padStart(2, '0')}` : formatGet(met)}
        </div>
      </div>

      <dl className="hud-telemetry">
        <div className="hud-cell">
          <dt className="hud-label">Velocity</dt>
          <dd className="hud-value">
            {Math.round(velocityKmh).toLocaleString('en-US')}
            <span className="hud-unit"> km/h</span>
          </dd>
        </div>
        <div className="hud-cell">
          <dt className="hud-label">Dist · Earth</dt>
          <dd className="hud-value">
            {formatKm(distEarth)}
            <span className="hud-unit"> km</span>
          </dd>
        </div>
        <div className="hud-cell">
          <dt className="hud-label">Dist · Moon</dt>
          <dd className="hud-value">
            {formatKm(distMoon)}
            <span className="hud-unit"> km</span>
          </dd>
        </div>
      </dl>

      <div className="hud-hint">
        {asButton ? (
          <button
            type="button"
            className={`hud-button${hint.action === 'launch' ? ' hud-button--launch' : ''}`}
            onClick={runAction}
          >
            {hint.label}
          </button>
        ) : (
          <>
            {hint.keys && <span className="hud-key">{hint.keys}</span>}
            <span className="hud-hint-label">{hint.label}</span>
          </>
        )}
        {isTouch && state.mode === 'flow' && (
          <span className="hud-touch-tip">Tap the rocket to inspect · Swipe to look around</span>
        )}
      </div>

      <div className="hud-track" aria-hidden="true">
        {PHASES.map((p, i) => (
          <span
            key={p.id}
            className={
              i < state.flow.phase
                ? 'hud-tick hud-tick--past'
                : i === state.flow.phase
                  ? 'hud-tick hud-tick--now'
                  : 'hud-tick'
            }
          />
        ))}
      </div>
    </div>
  )
}

export default Hud
