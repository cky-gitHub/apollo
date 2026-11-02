import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PHASES, MAX_PHASE } from '../data/phases.js'
import './Hud.css'

// Spools a displayed number toward its target with an ease-out, so phase
// steps read as live instrument sweeps instead of value pops. Purely a
// display concern — targets come straight from PHASES data.
function useSpooledValue(target, duration = 2400) {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)

  useEffect(() => {
    const from = displayRef.current
    if (from === target) return undefined
    const start = performance.now()
    let frameId
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1)
      const eased = 1 - (1 - t) ** 3
      const value = from + (target - from) * eased
      displayRef.current = value
      setDisplay(value)
      if (t < 1) frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [target, duration])

  return display
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
  const met = useSpooledValue(phase.met, 2800)
  const velocityKmh = useSpooledValue(phase.velocityMs * 3.6)
  const distEarth = useSpooledValue(phase.distEarthKm)
  const distMoon = useSpooledValue(phase.distMoonKm)

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
