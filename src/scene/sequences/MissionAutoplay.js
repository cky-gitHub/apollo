import { MAX_PHASE } from '../../data/phases.js'

// Auto-advances flow.phase once liftoff is airborne, so the whole 0-13
// mission plays start to finish with no input required — SpaceStepper's
// manual step still works (holding down Space or mashing it just skips this
// driver's pacing hold), it's simply no longer necessary.
//
// Two states this driver waits out before it's safe to step:
//  - phases 0-2 (countdown/ignition/liftoff): owned by LaunchSequence — wait
//    for it to reach 'holding' (risen, tower-clear framing settled).
//  - phases 3+: owned by StagingChoreography — wait for isSettled() (beat/
//    glide/tweens finished) AND the camera's transition into the new pose to
//    finish, so we never cut away mid-motion.
// Once ready, it holds the settled shot for a per-phase pacing beat (giving
// big moments like touchdown and Tranquility Base room to read) before
// stepping to the next phase.
const DEFAULT_HOLD_SECONDS = 2.2
const HOLD_SECONDS = {
  2: 1.3, // tower-clear breath before Max-Q's shake kicks in
  9: 3.0, // let touchdown register before cutting to the surface tableau
  10: 6.5, // Tranquility Base — the money shot, give it room
}

export class MissionAutoplay {
  constructor({ flowStore, sceneManager, launchSequence }) {
    this.flowStore = flowStore
    this.sceneManager = sceneManager
    this.launchSequence = launchSequence
    this._holdElapsed = 0

    this._onStoreChange = this._onStoreChange.bind(this)
    this._unsubscribe = flowStore.subscribe(this._onStoreChange)
  }

  // Any external phase/mode change (manual space step, test-rig jump,
  // inspect enter/exit) restarts the pacing clock so a hold always times
  // from the moment the CURRENT phase actually became current.
  _onStoreChange() {
    this._holdElapsed = 0
  }

  update(dt) {
    const { mode, flow } = this.flowStore.getSnapshot()
    if (mode !== 'flow' || !flow.autoplayComplete || flow.phase >= MAX_PHASE) {
      this._holdElapsed = 0
      return
    }

    const ready =
      flow.phase <= 2
        ? this.launchSequence?.stage === 'holding'
        : Boolean(this.sceneManager.choreography?.isSettled()) &&
          !this.sceneManager.cameraTransitioning

    if (!ready) {
      this._holdElapsed = 0
      return
    }

    this._holdElapsed += dt
    if (this._holdElapsed < (HOLD_SECONDS[flow.phase] ?? DEFAULT_HOLD_SECONDS)) return

    this._holdElapsed = 0
    this.flowStore.setPhase(Math.min(MAX_PHASE, flow.phase + 1))
  }

  dispose() {
    this._unsubscribe()
  }
}
