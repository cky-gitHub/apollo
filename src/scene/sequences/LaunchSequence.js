// On-demand countdown -> ignition -> liftoff sequence. Triggered manually
// (see phaseTestRig.js's 'L' key) rather than auto-running on load — nothing
// here changes flowState.js's default autoplayComplete value, it only calls
// the store's own methods once started.
//
// Phase transitions (0 -> 1 -> 2) go through flowStore.setPhase(), so
// SceneManager's existing subscribe -> setPhase -> camera-tween machinery
// handles every camera move. This file never touches the camera directly.
//
// The liftoff rise is an ease-in (slow off the pad, gathering speed) that
// ends still accelerating: MissionAutoplay steps straight to phase 3 the
// moment it finishes, and the Max-Q beat continues from velocityY, so the
// climb flows on without a stop.
const IGNITION_HOLD_SECONDS = 2
const LIFTOFF_DURATION_SECONDS = 9
const HOLD_RISE_METERS = 35 // how far above the pad the sequence holds — tuned to stay inside the phase-2 camera framing
// The sky's 0-1 altitude knob is budgeted across the whole ascent now that
// staging exists: liftoff only takes it partway so Max-Q and the separations
// still have darkening left to spend (StagingChoreography drives the rest).
const LIFTOFF_SKY_FACTOR = 0.35
const LIFTOFF_PLUME_STRETCH = 1.35 // plume lengthens as speed builds off the pad

function easeInCubic(t) {
  return t * t * t
}

export class LaunchSequence {
  constructor({ flowStore, rocket, exhaustSystem, skyEnvironment }) {
    this.flowStore = flowStore
    this.rocket = rocket
    this.exhaustSystem = exhaustSystem
    this.skyEnvironment = skyEnvironment

    this._padY = rocket.position.y
    this._stage = 'idle' // idle | countdown | ignitionHold | liftoff | holding
    this._stageStartMs = 0
    this._liftoffT = 0
    this._prevAutoplayComplete = flowStore.getSnapshot().flow.autoplayComplete

    this._onStoreChange = this._onStoreChange.bind(this)
    this._unsubscribe = flowStore.subscribe(this._onStoreChange)
  }

  get stage() {
    return this._stage
  }

  // 0-1 through the liftoff rise (1 once it has finished).
  get liftoffProgress() {
    return this._liftoffT
  }

  // Current climb rate in world units/s (analytic derivative of the rise).
  // Stays at the end-of-rise rate once the rise completes: the staging
  // choreography's Max-Q beat takes over on that same frame and continues
  // the climb from exactly this speed, so the stack never pauses.
  get velocityY() {
    if (this._liftoffT <= 0) return 0
    return (3 * this._liftoffT ** 2 * HOLD_RISE_METERS) / LIFTOFF_DURATION_SECONDS
  }

  // (Re)starts from T-3, resetting rocket position, exhaust, and sky.
  start() {
    this.rocket.position.y = this._padY
    this.exhaustSystem.extinguish()
    this.exhaustSystem.setStretch(1)
    this.skyEnvironment.setAltitudeFactor(0)

    this._stage = 'countdown'
    this._liftoffT = 0
    this._stageStartMs = performance.now()
    this._prevAutoplayComplete = false

    // resetCountdown() sets phase:0 and autoplayComplete:false together in
    // one emit — calling setPhase(0) separately first would emit with the
    // OLD (possibly already-true) autoplayComplete and fire ignition early.
    this.flowStore.resetCountdown()
  }

  _onStoreChange() {
    const { autoplayComplete } = this.flowStore.getSnapshot().flow
    if (this._stage === 'countdown' && autoplayComplete && !this._prevAutoplayComplete) {
      this._beginIgnition()
    }
    this._prevAutoplayComplete = autoplayComplete
  }

  _beginIgnition() {
    this._stage = 'ignitionHold'
    this._stageStartMs = performance.now()
    this.exhaustSystem.ignite()
    this.flowStore.setPhase(1)
  }

  // Called every frame from SceneManager's animation loop; no-ops unless a
  // timed stage (ignitionHold/liftoff) is in progress.
  update(nowMs) {
    if (this._stage === 'ignitionHold') {
      if ((nowMs - this._stageStartMs) / 1000 >= IGNITION_HOLD_SECONDS) {
        this._stage = 'liftoff'
        this._stageStartMs = nowMs
        this.flowStore.setPhase(2)
      }
      return
    }

    if (this._stage === 'liftoff') {
      const t = Math.min((nowMs - this._stageStartMs) / 1000 / LIFTOFF_DURATION_SECONDS, 1)
      this._liftoffT = t
      const eased = easeInCubic(t)
      this.rocket.position.y = this._padY + eased * HOLD_RISE_METERS
      this.skyEnvironment.setAltitudeFactor(eased * LIFTOFF_SKY_FACTOR)
      this.exhaustSystem.setStretch(1 + eased * (LIFTOFF_PLUME_STRETCH - 1))
      if (t >= 1) this._stage = 'holding'
    }
  }

  // Hands control of the rocket to the staging choreography (phase >= 3
  // entered mid-run, or inspect mode opened). Stops this sequence's own
  // rocket-position writes without resetting anything.
  interrupt() {
    if (this._stage === 'idle') return
    this._stage = 'holding'
  }

  dispose() {
    this._unsubscribe()
  }
}
