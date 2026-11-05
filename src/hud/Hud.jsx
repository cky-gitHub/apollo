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
    if (!live || live.to !== phaseIndex) return { ...telemetryAt(phaseIndex, to, 1), settled: !live }
    return { ...telemetryAt(live.from, to, live.t), settled: live.t >= 1 }
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
        Math.abs(next.distMoonKm - last.distMoonKm) > 0.01 ||
        next.settled !== last.settled
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

// What the centre control under the clock shows. `action` is set when it is
// something to press (always a button); `keys` is the desktop keyboard
// shortcut for it, shown inside the button. `loading` swaps in the
// vehicle-loading indicator.
function hintFor(state, ready, missionOver) {
  if (state.mode === 'inspect') {
    return { keys: 'ESC', action: 'resume', label: 'Resume flight' }
  }
  if (!state.flow.launched) {
    return ready
      ? { keys: 'SPACE', action: 'launch', label: 'Launch' }
      : { keys: null, action: null, label: 'Preparing vehicle', loading: true }
  }
  if (!state.flow.autoplayComplete) {
    return { keys: null, action: null, label: 'Countdown' }
  }
  if (state.flow.phase >= MAX_PHASE) {
    // Splashdown settled: one click (or Space) starts over from the pad.
    return missionOver
      ? { keys: 'SPACE', action: 'restart', label: 'Fly again' }
      : { keys: null, action: null, label: 'Reentry' }
  }
  return { keys: 'SPACE', action: 'next', label: `Next · ${PHASES[state.flow.phase + 1].name}` }
}

function Hud({ flowStore, ready = false, onLaunch, onRestart }) {
  const state = useSyncExternalStore(flowStore.subscribe, flowStore.getSnapshot)
  const phase = PHASES[state.flow.phase] ?? PHASES[0]

  const inCountdown = state.flow.phase === 0 && !state.flow.autoplayComplete
  const telemetry = useTelemetry(flowStore, state.flow.phase)
  const met = telemetry.met
  const velocityKmh = telemetry.velocityMs * 3.6
  const distEarth = telemetry.distEarthKm
  const distMoon = telemetry.distMoonKm

  const isTouch = useIsTouch()
  const missionOver = state.flow.phase >= MAX_PHASE && telemetry.settled
  const hint = hintFor(state, ready, missionOver)

  // Space restarts once the mission is over (SpaceStepper has nothing left
  // to step to by then). A focused button handles Space itself.
  useEffect(() => {
    if (!missionOver || state.mode !== 'flow') return undefined
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat) return
      const tag = event.target?.tagName
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA') return
      if (window.scrollY > window.innerHeight * 0.5) return
      event.preventDefault()
      onRestart?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [missionOver, state.mode, onRestart])
  // The look-around / inspect guide: shown from page load until the climb
  // is under way (phase 3), then it gets out of the way.
  const showGuide = state.mode === 'flow' && state.flow.phase < 3

  const runAction = () => {
    if (hint.action === 'launch') onLaunch?.()
    else if (hint.action === 'resume') flowStore.setMode('flow')
    else if (hint.action === 'restart') onRestart?.()
    else if (hint.action === 'next') flowStore.setPhase(Math.min(MAX_PHASE, state.flow.phase + 1))
  }

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

      <div className="hud-action">
        {hint.action ? (
          <button
            type="button"
            className={`hud-button${hint.action === 'launch' ? ' hud-button--launch' : ''}`}
            onClick={runAction}
          >
            <span>{hint.label}</span>
            {!isTouch && hint.keys && <span className="hud-key">{hint.keys}</span>}
          </button>
        ) : hint.loading ? (
          <div className="hud-loading" role="status">
            <span className="hud-loading-ring" aria-hidden="true" />
            <span className="hud-hint-label">{hint.label}</span>
          </div>
        ) : (
          <span className="hud-hint-label">{hint.label}</span>
        )}
      </div>

      <ul className={`hud-guide${showGuide ? '' : ' hud-guide--hidden'}`} aria-hidden={!showGuide}>
        <li>
          <svg className="hud-guide-icon hud-guide-icon--look" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 9.5 5h5zM12 21.5 9.5 19h5zM2.5 12 5 9.5v5zM21.5 12 19 9.5v5z" />
            <circle cx="12" cy="12" r="2.2" />
          </svg>
          <span>
            {isTouch
              ? 'Swipe sideways to look around'
              : 'Click and drag, or swipe two fingers on the trackpad, to look around'}
          </span>
        </li>
        <li>
          <svg className="hud-guide-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3v15.5l4.2-4 2.7 6.2 2.6-1.1-2.7-6.1H18.5z" />
          </svg>
          <span>
            {isTouch
              ? 'Tap the rocket to take it apart · tap anywhere else to resume the flight'
              : 'Click the rocket to take it apart · click anywhere else to resume the flight'}
          </span>
        </li>
      </ul>

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
