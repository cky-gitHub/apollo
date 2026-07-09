import * as THREE from 'three'
import { ExhaustSystem, EXHAUST_PRESETS } from '../particles/ExhaustSystem.js'
import { SeparationFlash } from '../particles/SeparationFlash.js'
import { Parachutes } from '../rocket/Parachutes.js'

// Powered ascent, staging, and the trans-lunar arc: phases 3-9, from Max-Q
// through S-IC/S-II staging, TLI, transposition-and-docking, lunar approach,
// and the LM's powered descent to the surface.
//
// Driven entirely by flow.phase, per the state machine:
//  - A forward step from the adjacent phase plays that phase's BEAT — a
//    timed cinematic (engine cutoff, retro flash, stage tumbling away, next
//    stage lighting) that ends in the phase's settled flight state.
//  - Any other arrival (test-rig jump, inspect-mode exit)
//    GLIDES to the settled state directly: continuous quantities tween over
//    ~a second, discrete ones (which stages are attached, which engine
//    burns, whether the CSM is stowed/docked/gone) apply immediately. Every
//    phase is therefore reachable from any other without broken states.
//
// The rocket group is moved/tilted here; the camera never is — camera
// framing lives in cameraPath.js as rocket-relative poses that track the
// vehicle, so this file and the camera system stay decoupled.
//
// From phase 7 on, the "journey" is staged around the vehicle rather than
// flown by it: the rocket group only drifts, while Earth/Moon positions,
// scales and the sun direction are lerped through the same continuous
// channel as the rocket transform (see the env blocks in SETTLED). Phase 9
// descends onto the Moon sphere itself — its top surface is the landing
// terrain, so approach and touchdown share one physical backdrop.
//
// Ownership handshake with LaunchSequence (phases 0-2): while its
// countdown/ignition/liftoff run is in progress it owns the rocket, and this
// module ignores phase changes at or below 2. Entering phase >= 3 (or
// inspect mode) interrupts it, after which this module owns the rocket
// transform for as long as a beat/glide is active or the phase is >= 3.

const DEG = Math.PI / 180
const GLIDE_SECONDS = 0.9
const DEBRIS_GRAVITY = 9 // aesthetic world-units/s^2 — spent stages sink, slowly
const DEBRIS_MAX_AGE_SECONDS = 30
const DEBRIS_MAX_DISTANCE = 1600 // from the rocket; far enough to be sub-pixel

// SLA panel jettison (transposition beat). The four petals hinge open on
// their base lines to this angle, then the hinges release and spring
// thrusters fling each panel away tumbling — Apollo 11 jettisoned the
// panels entirely (they were not left hinged open like on Apollo 7).
const SLA_OPEN_ANGLE = 50 * DEG
const SLA_OPEN_SECONDS = 1.05
const SLA_PANEL_SPEED = 7.5 // m/s radial spring ejection at release

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// Separation beats: momentum bleeds off after cutoff (fast start, flattening)
// until the next stage lights at the knot, then a smooth re-acceleration.
function coastThenBurn(knotT, knotP) {
  return (t) => {
    if (t < knotT) {
      const u = t / knotT
      return knotP * (1 - (1 - u) * (1 - u))
    }
    const u = (t - knotT) / (1 - knotT)
    return knotP + (1 - knotP) * easeInOutCubic(u)
  }
}

// Environment staging per phase: Earth/Moon [x, y, z, scale, opacity] and
// the key light's position (sun direction). Pre-TLI phases keep the bodies
// at their phase-7 entry marks with opacity 0, so the reveal is a fade,
// never a sweep across the frame. LIGHT_SPACE swings the sun toward +Z for
// the space phases so both discs show a terminator instead of facing the
// camera dark.
const LIGHT_HOME = [180, 220, 120]
const LIGHT_SPACE = [500, 1400, 3200]
// The Pacific recovery zone only exists for phase 13 — every other phase
// holds it at the splash site with opacity 0 so the reveal is a fade under
// the descending CM, same pattern as the pre-TLI Earth/Moon.
const OCEAN_HIDDEN = [2300, 40, 0, 1, 0]
const ENV_HOME = {
  earth: [-2700, 800, -1500, 1, 0],
  moon: [5200, 2100, -900, 0.28, 0],
  ocean: OCEAN_HIDDEN,
  light: LIGHT_HOME,
}

// Settled flight state per phase. pos is the rocket group origin (base of
// the stack) in world units; tilt is the gravity-turn lean (rotation.z =
// -tilt, nose toward +X). Absolute numbers are cinematic, not physical —
// the camera rides with the rocket, so only relative motion and the
// receding pad/debris read on screen.
//
// csm: 'stowed' (riding the stack) | 'docked' (transposed, nose on the LM)
//      | 'gone' (departed as debris before the descent)
//      | 'cm' (Command Module alone, home transform, apex up — reentry)
// lm:  whether the Lunar Module is revealed (it hides inside the SLA
//      adapter until transposition).
// chutes: whether the recovery parachutes sit deployed (phase 13 only).
// env.moon in phase 9 is sized/placed so the sphere's top surface sits
// exactly under the LM's footpads at the settled pos — the landing site.
const SETTLED = [
  { pos: [0, 0, 0], tilt: 0, burn: null, sky: 0, pad: 1, stretch: 1, detached: [], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [0, 0, 0], tilt: 0, burn: 'S-IC', sky: 0, pad: 1, stretch: 1, detached: [], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [0, 35, 0], tilt: 0, burn: 'S-IC', sky: 0.35, pad: 1, stretch: 1.35, detached: [], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [24, 420, 0], tilt: 12 * DEG, burn: 'S-IC', sky: 0.62, pad: 0.65, stretch: 2.0, detached: [], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [110, 950, 0], tilt: 27 * DEG, burn: 'S-II', sky: 0.85, pad: 0, stretch: 1.5, detached: ['S-IC'], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [300, 1550, 0], tilt: 45 * DEG, burn: 'S-II', sky: 1, pad: 0, stretch: 1.8, detached: ['S-IC', 'LES'], csm: 'stowed', lm: false, env: ENV_HOME },
  { pos: [560, 2150, 0], tilt: 63 * DEG, burn: 'S-IVB', sky: 1, pad: 0, stretch: 1.7, detached: ['S-IC', 'LES', 'S-II'], csm: 'stowed', lm: false, env: ENV_HOME },
  {
    pos: [760, 2510, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'docked', lm: true,
    env: { earth: [-2700, 800, -1500, 1, 1], moon: [5200, 2100, -900, 0.28, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  {
    pos: [860, 2560, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'docked', lm: true,
    env: { earth: [-4300, 300, -2400, 0.55, 1], moon: [2600, 200, -400, 0.95, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  // 9's moon is sized/positioned so its top surface sits exactly under the
  // LM's footpads at the settled pos; the 8->9 lerp path was checked to keep
  // that surface below the descending vehicle the whole way.
  {
    pos: [980, 2080, 0], tilt: 0, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'gone', lm: true,
    env: { earth: [-400, 4700, -2600, 0.12, 1], moon: [980, -379, 0, 1.7, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  // 10: Tranquility Base — identical vehicle/env state to touchdown; the
  // phase exists as a held tableau (camera re-frame + HUD beat), so there is
  // deliberately no BEATS[10] entry.
  {
    pos: [980, 2080, 0], tilt: 0, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'gone', lm: true,
    env: { earth: [-400, 4700, -2600, 0.12, 1], moon: [980, -379, 0, 1.7, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  // 11: ascent & rendezvous — the ascent stage climbs off the descent-stage
  // launch pad (abandoned onto the Moon group so it recedes WITH the
  // terrain), then Columbia rejoins and docks. Settled = docked in orbit.
  {
    pos: [1080, 2700, 0], tilt: 62 * DEG, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS'], csm: 'docked', lm: true,
    env: { earth: [-3900, 2800, -2300, 0.18, 1], moon: [1150, -125, -500, 1.15, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  // 12: trans-Earth injection — Eagle's ascent stage jettisoned, SPS burn
  // for home; the Moon falls behind, Earth swells ahead.
  {
    // (pos.y is kept moderate so the 12->13 reentry dive stays within what
    // the camera chase can hold in frame.)
    pos: [1500, 1500, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS', 'LM'], csm: 'docked', lm: true,
    env: { earth: [-3000, 600, -1700, 0.8, 1], moon: [3500, 300, -1300, 0.5, 1], ocean: OCEAN_HIDDEN, light: LIGHT_SPACE },
  },
  // 13: reentry & splashdown — SM jettisoned, blunt-end-forward entry, sky
  // fades back to blue while the ocean fades in; settles bobbing on the
  // water under deployed mains. pos.y puts the CM's heat shield at the
  // ocean surface (y=40) given the CM's ~97m stack-local height.
  {
    pos: [2300, -58, 0], tilt: 0, burn: null, sky: 0, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS', 'LM', 'SM'], csm: 'cm', lm: true, chutes: true,
    env: { earth: [-3000, 600, -1700, 1.1, 0], moon: [3400, 1500, -1300, 0.5, 0], ocean: [2300, 40, 0, 1, 1], light: [2600, 1600, 1000] },
  },
]

// Timed beats, keyed by the phase being entered. `at` is seconds from beat
// start. Event handlers take (choreography, instant) — instant means the
// beat is being fast-forwarded (user pressed space again mid-beat / jumped away)
// and only the state change should apply, no pyrotechnics. Events that
// start tweens must therefore leave the final transform to a later
// instant-safe event (see the dock event).
const BEATS = {
  // 2 -> 3: throttle through Max-Q. Continuous burn, plume stretches, pad
  // and blue sky fall away, heaviest camera shake of the flight.
  3: {
    duration: 5.0,
    progress: easeInOutCubic,
    valid: (c) => !c._detached.has('S-IC'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._setVibe(1)
          c._exhausts['S-IC'].ignite()
          c._exhausts['S-IC'].setStretch(SETTLED[3].stretch)
        },
      },
      { at: 0.3, run: (c) => c._exhausts['S-IC'].setSmokeEnabled(false) },
    ],
  },
  // 3 -> 4: MECO, S-IC separation, S-II ignition. The money shot: engines
  // snap out, a breath of silent coasting, retro flash, the spent stage
  // tumbles away below, then the J-2s light up blue.
  4: {
    duration: 7.5,
    progress: coastThenBurn(2.05 / 7.5, 0.3),
    valid: (c) => !c._detached.has('S-IC'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._exhausts['S-IC'].extinguish()
          c._setVibe(0.12)
        },
      },
      {
        at: 0.55,
        run: (c, instant) =>
          c._separate('S-IC', instant, {
            // Spent stages inherit only a fraction of the vehicle's motion:
            // the beat easing brings the live rocket to rest in its settled
            // frame, and a stage carrying full velocity would sail past it.
            along: 0.35,
            back: 14,
            lateral: 2,
            spinRate: 0.35,
            flashScale: 34,
            sparkSpeed: 26,
            flashAtTop: true,
          }),
      },
      {
        at: 2.05,
        run: (c, instant) => {
          c._exhausts['S-II'].ignite()
          c._exhausts['S-II'].setStretch(SETTLED[4].stretch)
          c._setVibe(0.9)
          if (!instant) c._igniteFlash('S-II')
        },
      },
    ],
  },
  // 4 -> 5: steady S-II climb; the escape tower rockets away mid-beat.
  5: {
    duration: 6.0,
    progress: easeInOutCubic,
    valid: (c) => !c._detached.has('LES'),
    events: [
      { at: 0, run: (c) => c._exhausts['S-II'].setStretch(SETTLED[5].stretch) },
      {
        at: 2.6,
        run: (c, instant) =>
          c._separate('LES', instant, {
            along: 1,
            back: -34, // fires FORWARD, away from the stack
            lateral: 6,
            spinRate: 1.0,
            flashScale: 10,
            sparkSpeed: 10,
          }),
      },
    ],
  },
  // 5 -> 6: S-II cutoff and separation, S-IVB lights for TLI. Same shape as
  // the first staging but statelier — thinner air, one engine, wider plume.
  6: {
    duration: 7.5,
    progress: coastThenBurn(2.1 / 7.5, 0.3),
    valid: (c) => !c._detached.has('S-II'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._exhausts['S-II'].extinguish()
          c._setVibe(0.12)
        },
      },
      {
        at: 0.6,
        run: (c, instant) =>
          c._separate('S-II', instant, {
            along: 0.35,
            back: 10,
            lateral: 1.5,
            spinRate: 0.18,
            flashScale: 26,
            sparkSpeed: 20,
            flashAtTop: true,
          }),
      },
      {
        at: 2.1,
        run: (c, instant) => {
          c._exhausts['S-IVB'].ignite()
          c._exhausts['S-IVB'].setStretch(SETTLED[6].stretch)
          c._setVibe(0.85)
          if (!instant) c._igniteFlash('S-IVB')
        },
      },
    ],
  },
  // 6 -> 7: TLI cutoff, then transposition & docking while Earth materializes
  // behind. The long, quiet centerpiece: the SLA's four petal panels blow
  // apart and spring away tumbling, exposing the LM on the S-IVB; the CSM
  // pulls ahead, flips end-over-end, glides back to dock nose-to-nose; and
  // finally the spent S-IVB (carrying the SLA's fixed aft ring) drifts away
  // below — the extraction, seen from the LM's side.
  7: {
    duration: 17.5,
    progress: easeInOutCubic,
    // Environment (Earth reveal, sun swing) settles by ~55% so the backdrop
    // is fully in while the docking plays out in front of it.
    ease: (t) => easeInOutCubic(Math.min(t / 0.55, 1)),
    valid: (c) => !c._detached.has('S-IVB') && c._csmState === 'stowed',
    events: [
      {
        at: 0.9,
        run: (c) => {
          c._exhausts['S-IVB'].extinguish()
          c._setVibe(0.12)
        },
      },
      { at: 2.0, run: (c) => c._setVibe(0) },
      {
        at: 2.9,
        run: (c, instant) => {
          // Pyro: the joints between the petals sever and the panels start
          // hinging outward — which is also the moment the LM first shows.
          c._setLmVisible(true)
          if (!instant) c._openSlaPanels()
        },
      },
      { at: 4.2, run: (c, instant) => c._releaseSlaPanels(instant) },
      {
        at: 5.2,
        run: (c, instant) => {
          // CSM pulls ahead of the stack to get room for the flip.
          if (instant) return // dock event applies the final transform
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          const fromY = csm.position.y
          c._addTween(2.6, (t) => {
            csm.position.y = fromY + 16 * t
          })
        },
      },
      {
        at: 8.2,
        run: (c, instant) => {
          if (instant) return
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          c._addTween(3.4, (t) => {
            csm.rotation.z = Math.PI * t
          })
        },
      },
      {
        at: 12.2,
        run: (c, instant) => {
          if (instant) return
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          const fromY = csm.position.y
          c._addTween(2.9, (t) => {
            csm.position.y = THREE.MathUtils.lerp(fromY, c._dockLocalY, t)
          })
        },
      },
      {
        at: 15.4,
        run: (c, instant) => {
          // Contact: instant-safe hard dock — snaps whatever the tweens
          // reached to the exact docked transform.
          const csm = c._jettisonable['CSM']?.object
          if (csm) {
            csm.position.y = c._dockLocalY
            csm.rotation.set(0, 0, Math.PI)
          }
          c._csmState = 'docked'
          if (!instant && csm) {
            const pos = csm
              .getWorldPosition(new THREE.Vector3())
              .addScaledVector(c._axis(), -(csm.userData.apexOffset ?? 3.5))
            c.flash.spawn(pos, { scale: 6, sparkSpeed: 3 })
          }
        },
      },
      {
        at: 16.3,
        run: (c, instant) =>
          c._separate('S-IVB', instant, {
            along: 0.4,
            back: 9,
            lateral: 1.2,
            spinRate: 0.12,
            flashScale: 16,
            sparkSpeed: 10,
            flashAtTop: true,
            gravity: 0,
          }),
      },
    ],
  },
  // 7 -> 8: lunar approach. The Moon swells ahead while Earth falls away to
  // a marble; mid-phase the SPS lights for the braking burn — engine-first,
  // which the transposition flip conveniently already arranged.
  8: {
    duration: 9.5,
    progress: easeInOutCubic,
    valid: (c) => c._csmState === 'docked' && c._detached.has('S-IVB'),
    events: [
      {
        at: 0.8,
        run: (c, instant) => {
          c._exhausts['SPS'].ignite()
          c._exhausts['SPS'].setStretch(1)
          c._setVibe(0.45)
          if (!instant) c._igniteFlash('SPS', 8, 5)
        },
      },
      {
        at: 6.8,
        run: (c) => {
          c._exhausts['SPS'].extinguish()
          c._setVibe(0)
        },
      },
    ],
  },
  // 8 -> 9: undocking and powered descent — the finale. The CSM departs,
  // the descent engine lights, the LM rights itself as it drops, and the
  // Moon's surface rises to meet it: dust, cutoff, stillness.
  9: {
    duration: 20,
    // Motion (descent) completes at 86% so the touchdown events land on a
    // settled vehicle; orientation/environment settle earlier still (78%) so
    // the ground has stopped moving before contact.
    progress: (t) => easeInOutCubic(Math.min(t / 0.86, 1)),
    ease: (t) => easeInOutCubic(Math.min(t / 0.78, 1)),
    valid: (c) => c._csmState === 'docked',
    events: [
      {
        at: 1.0,
        run: (c, instant) => {
          c._csmState = 'gone'
          c._separate('CSM', instant, {
            along: 0.2,
            back: -7, // departs forward, off the LM's roof
            lateral: 1.5,
            spinRate: 0.08,
            flashScale: 7,
            sparkSpeed: 4,
            gravity: 0,
          })
        },
      },
      {
        at: 2.2,
        run: (c) => {
          c._exhausts['DPS'].ignite()
          c._exhausts['DPS'].setStretch(1)
          c._setVibe(0.5)
        },
      },
      {
        at: 17.2,
        run: (c, instant) => {
          if (instant || !c._lmGroup) return
          const pos = c._lmGroup
            .getWorldPosition(new THREE.Vector3())
            .addScaledVector(c._axis(), -(c._lmGroup.userData.bodyLength ?? 4.5) / 2)
          c.flash.spawnDust(pos, { speed: 8 })
        },
      },
      {
        at: 17.6,
        run: (c) => {
          c._exhausts['DPS'].extinguish()
          c._setVibe(0)
        },
      },
    ],
  },
  // 10 -> 11: lunar liftoff and rendezvous. The ascent stage punches off the
  // descent stage (which stays behind as the launch pad, parented onto the
  // Moon so it recedes with the terrain), climbs to orbit while the surface
  // falls away, and Columbia slides in to dock. The environment holds still
  // for the first third — vertical rise off solid ground — before the Moon
  // recedes underneath.
  11: {
    duration: 18,
    progress: easeInOutCubic,
    ease: (t) => easeInOutCubic(Math.max(0, (t - 0.35) / 0.65)),
    valid: (c) =>
      c._csmState === 'gone' && !c._detached.has('LM-DS') && !c._detached.has('LM'),
    events: [
      {
        at: 0.6,
        run: (c, instant) => {
          c._abandonToMoon('LM-DS', instant)
          if (c._exhausts['APS']) {
            c._exhausts['APS'].ignite()
            c._exhausts['APS'].setStretch(1)
          }
          c._setVibe(0.45)
          if (!instant && c._lmGroup) {
            const pos = c._lmGroup
              .getWorldPosition(new THREE.Vector3())
              .addScaledVector(c._axis(), -(c._lmGroup.userData.bodyLength ?? 4.5) / 2)
            c.flash.spawnDust(pos, { speed: 7 })
          }
        },
      },
      {
        at: 8.6,
        run: (c) => {
          c._exhausts['APS']?.extinguish()
          c._setVibe(0)
        },
      },
      {
        at: 10.2,
        run: (c, instant) => {
          // Columbia rejoins: restored into the stack frame well ahead of
          // the ascent stage, then closes to just short of contact. The dock
          // event below is the instant-safe hard set.
          if (instant) return
          c._restore('CSM')
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          csm.rotation.set(0, 0, Math.PI)
          const fromY = c._dockLocalY + 46
          csm.position.y = fromY
          c._addTween(5.0, (t) => {
            csm.position.y = THREE.MathUtils.lerp(fromY, c._dockLocalY + 1.2, t)
          })
        },
      },
      {
        at: 15.8,
        run: (c, instant) => {
          c._restore('CSM')
          const csm = c._jettisonable['CSM']?.object
          if (csm) {
            csm.position.y = c._dockLocalY
            csm.rotation.set(0, 0, Math.PI)
          }
          c._csmState = 'docked'
          if (!instant && csm) {
            const pos = csm
              .getWorldPosition(new THREE.Vector3())
              .addScaledVector(c._axis(), -(csm.userData.apexOffset ?? 3.5))
            c.flash.spawn(pos, { scale: 5, sparkSpeed: 3 })
          }
        },
      },
    ],
  },
  // 11 -> 12: trans-Earth injection. Eagle's ascent stage is cast off, a
  // quiet beat, then the SPS lights for home while the Moon drops away
  // behind and Earth begins to grow ahead.
  12: {
    duration: 12,
    progress: easeInOutCubic,
    valid: (c) => c._csmState === 'docked' && c._detached.has('LM-DS') && !c._detached.has('LM'),
    events: [
      {
        at: 0.9,
        run: (c, instant) =>
          c._separate('LM', instant, {
            along: 0.3,
            back: 7,
            lateral: 2,
            spinRate: 0.3,
            flashScale: 8,
            sparkSpeed: 5,
            gravity: 0,
          }),
      },
      {
        at: 3.0,
        run: (c, instant) => {
          c._exhausts['SPS'].ignite()
          c._exhausts['SPS'].setStretch(1)
          c._setVibe(0.45)
          if (!instant) c._igniteFlash('SPS', 8, 5)
        },
      },
      {
        at: 9.6,
        run: (c) => {
          c._exhausts['SPS'].extinguish()
          c._setVibe(0)
        },
      },
    ],
  },
  // 12 -> 13: reentry and splashdown — the finale. The Service Module is
  // cut loose, the Command Module swings blunt-end forward, hits the
  // atmosphere in a sheath of plasma while the sky floods back in, then
  // mains out, and the mission ends bobbing in the Pacific.
  13: {
    duration: 26,
    // Motion completes at 90% so the splash happens on settled water;
    // orientation/sky/ocean settle earlier (78%) — same pattern as the
    // lunar touchdown.
    progress: (t) => easeInOutCubic(Math.min(t / 0.9, 1)),
    ease: (t) => easeInOutCubic(Math.min(t / 0.78, 1)),
    valid: (c) => c._csmState === 'docked' && c._detached.has('LM') && !c._detached.has('SM'),
    events: [
      {
        at: 0.8,
        run: (c, instant) =>
          c._separate('SM', instant, {
            along: 0.25,
            back: 6,
            lateral: 1.5,
            spinRate: 0.4,
            flashScale: 8,
            sparkSpeed: 5,
            gravity: 0,
            maxAge: 14,
          }),
      },
      {
        at: 2.4,
        run: (c, instant) => {
          // Blunt-end forward: unwind the transposition flip and settle the
          // body back to its home (apex-up) transform for the descent.
          if (instant) return
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          const fromY = csm.position.y
          const homeY = c._jettisonable['CSM'].position.y
          c._addTween(3.2, (t) => {
            csm.rotation.z = Math.PI * (1 - t)
            csm.position.y = THREE.MathUtils.lerp(fromY, homeY, t)
          })
        },
      },
      {
        at: 6.4,
        run: (c) => {
          c._exhausts['PLASMA']?.ignite()
          c._exhausts['PLASMA']?.setStretch(1)
          c._setVibe(1.15)
        },
      },
      { at: 13.8, run: (c) => c._exhausts['PLASMA']?.setStretch(0.35) },
      {
        at: 15.4,
        run: (c) => {
          c._exhausts['PLASMA']?.extinguish()
          c._setVibe(0.25)
        },
      },
      {
        at: 17.0,
        run: (c, instant) => {
          if (instant) return // settled chutes flag applies the final state
          c._addTween(2.6, (t) => c._parachutes?.setProgress(t))
        },
      },
      {
        at: 23.2,
        run: (c, instant) => {
          c._setVibe(0)
          if (instant) return
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          const pos = csm
            .getWorldPosition(new THREE.Vector3())
            .addScaledVector(c._axis(), -(csm.userData.apexOffset ?? 3.5))
          c.flash.spawnDust(pos, { speed: 14 })
        },
      },
    ],
  },
}

const LAUNCH_DRIVING_STAGES = new Set(['countdown', 'ignitionHold', 'liftoff'])

export class StagingChoreography {
  constructor({
    flowStore,
    sceneManager,
    scene,
    rocket,
    stageGroups,
    launchSequence,
    sicExhaust,
    skyEnvironment,
    launchPad,
    earth,
    moon,
    ocean,
    keyLight,
  }) {
    this.flowStore = flowStore
    this.sceneManager = sceneManager
    this.scene = scene
    this.rocket = rocket
    this.stageGroups = stageGroups
    this.launchSequence = launchSequence
    this.skyEnvironment = skyEnvironment
    this.launchPad = launchPad
    this.earth = earth
    this.moon = moon
    this.ocean = ocean
    this.keyLight = keyLight

    this.flash = new SeparationFlash(scene)

    // Upper-stage engines get their own exhaust systems, anchored to their
    // stage groups exactly like the S-IC one built in SceneManager.
    const s2 = stageGroups.get('S-II')
    const s4 = stageGroups.get('S-IVB')
    this._lmGroup = stageGroups.get('LM') ?? null
    const csmBody = rocket.getObjectByName('CSM-Body')
    this._exhausts = {
      'S-IC': sicExhaust,
      'S-II': new ExhaustSystem(
        s2,
        -(s2.userData.bodyLength ?? 0) / 2 + 1.2,
        EXHAUST_PRESETS.J2_CLUSTER,
      ),
      'S-IVB': new ExhaustSystem(
        s4,
        -(s4.userData.bodyLength ?? 0) / 2 + 1.0,
        EXHAUST_PRESETS.J2_SINGLE,
      ),
    }
    if (csmBody) {
      this._exhausts.SPS = new ExhaustSystem(
        csmBody,
        (csmBody.userData.engineOffsetY ?? -4),
        EXHAUST_PRESETS.SPS_SINGLE,
      )
    }
    if (this._lmGroup) {
      this._exhausts.DPS = new ExhaustSystem(
        this._lmGroup,
        -(this._lmGroup.userData.bodyLength ?? 4.5) / 2 + 0.35,
        EXHAUST_PRESETS.DPS_SINGLE,
      )
    }
    const lmAscent = rocket.getObjectByName('LM-Ascent')
    if (lmAscent) {
      this._exhausts.APS = new ExhaustSystem(
        lmAscent,
        (lmAscent.userData.engineOffsetY ?? 2.4),
        EXHAUST_PRESETS.APS_SINGLE,
      )
    }
    // Reentry plasma sheath: anchored at the CM's heat shield and flipped
    // 180° so the incandescent wake streams up past the capsule, opposite
    // the direction of travel. Offsets measured while the stack still sits
    // assembled at the pad (world y == rocket-local y), like _dockLocalY.
    const cmGroup = rocket.getObjectByName('CM')
    if (csmBody && cmGroup) {
      rocket.updateWorldMatrix(true, true)
      const cmBottomY = new THREE.Box3().setFromObject(cmGroup).min.y
      const pivotY = csmBody.getWorldPosition(new THREE.Vector3()).y
      this._exhausts.PLASMA = new ExhaustSystem(
        csmBody,
        cmBottomY - pivotY + 0.25,
        EXHAUST_PRESETS.REENTRY_PLASMA,
      )
      this._exhausts.PLASMA.group.rotation.z = Math.PI
    }

    // Recovery mains ride the CM's apex; hidden until the reentry beat
    // (or the phase-13 settled chutes flag) deploys them.
    this._parachutes = null
    if (csmBody) {
      this._parachutes = new Parachutes()
      this._parachutes.group.position.y = (csmBody.userData.apexOffset ?? 3.5) - 0.2
      csmBody.add(this._parachutes.group)
    }

    // Everything that can leave the stack, with its home attachment +
    // transform so any jump/inspect round-trip can rebuild the full vehicle.
    this._jettisonable = {}
    ;['S-IC', 'S-II', 'S-IVB'].forEach((id) => this._storeHome(id, stageGroups.get(id)))
    const lesGroup = rocket.getObjectByName('LES')
    if (lesGroup) this._storeHome('LES', lesGroup)
    this._storeHome('SLA', rocket.getObjectByName('CSM-SLA-Adapter'))
    if (csmBody) this._storeHome('CSM', csmBody)
    // The SLA's four petal hinge groups (see RocketAssembly.createSlaAssembly).
    // 'SLA' stays a single jettisonable id, but the petals leave the group as
    // individual debris at release — their homes are kept here so
    // _restore('SLA') can rebuild the closed cone.
    this._slaPetals = []
    this._slaTweens = []
    const slaGroup = this._jettisonable['SLA']?.object
    slaGroup?.children.forEach((child) => {
      if (!child.name.startsWith('SLA-Panel')) return
      this._slaPetals.push({
        object: child,
        parent: child.parent,
        position: child.position.clone(),
        quaternion: child.quaternion.clone(),
        scale: child.scale.clone(),
      })
    })
    // Return-journey hardware: the LM's stages part ways at lunar liftoff,
    // the whole (ascent-only) LM group goes before TEI, the SM at entry.
    if (this._lmGroup) this._storeHome('LM', this._lmGroup)
    this._storeHome('LM-DS', rocket.getObjectByName('LM-Descent'))
    this._storeHome('SM', rocket.getObjectByName('SM'))

    // Docked transform for the transposed CSM (local to its stage group):
    // rotated 180°, positioned so the CM apex kisses the LM's docking hatch.
    // Computed here while the whole stack still sits assembled at the pad
    // (rocket at origin, identity), where world y == rocket-local y.
    this._dockLocalY = csmBody ? csmBody.position.y : 0
    if (csmBody && this._lmGroup) {
      rocket.updateWorldMatrix(true, true)
      const lmTopY = new THREE.Box3().setFromObject(this._lmGroup).max.y
      const stageY = csmBody.parent.getWorldPosition(new THREE.Vector3()).y
      this._dockLocalY = lmTopY - stageY + (csmBody.userData.apexOffset ?? 3.5) + 0.12
    }

    // Pad materials cached for the altitude fade. While fading, the pad
    // joins the transparent render pass, where its huge apron sorts as
    // "nearest" (its origin projects behind the camera at altitude) and
    // would get painted OVER the exhaust plume — pin it to the front of the
    // pass so the plume always draws on top of it.
    this._padMaterials = []
    launchPad.traverse((object) => {
      if (object.isMesh) {
        object.renderOrder = -1
        this._padMaterials.push(object.material)
      }
    })
    this._padOpacity = 1

    this._detached = new Set()
    this._debris = []
    this._beat = null
    this._glide = null
    this._tweens = []
    this._csmState = 'stowed'
    this._vibe = 0
    this._time = 0
    this._rocketVel = new THREE.Vector3()
    this._prevFlightPos = rocket.position.clone()
    this._flightPos = rocket.position.clone()
    this._flightTilt = 0
    this._envNow = structuredClone(ENV_HOME)

    const snapshot = flowStore.getSnapshot()
    this._phase = snapshot.flow.phase
    this._mode = snapshot.mode

    this._onStoreChange = this._onStoreChange.bind(this)
    this._unsubscribe = flowStore.subscribe(this._onStoreChange)

    // If the page loads on a phase > 2 (shouldn't normally, but the store is
    // the source of truth), align with it.
    if (this._phase >= 3) this._snapTo(this._phase, { glide: false })
  }

  _storeHome(id, object) {
    if (!object) return
    this._jettisonable[id] = {
      object,
      parent: object.parent,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      // scene.attach() during separation bakes ancestor scale (the GLB's
      // feet->meters factor) into the object; restore needs the original.
      scale: object.scale.clone(),
    }
  }

  // ---------------------------------------------------------------- store

  _onStoreChange() {
    const { mode, flow } = this.flowStore.getSnapshot()

    if (mode !== this._mode) {
      this._mode = mode
      if (mode === 'inspect') this._enterInspect()
      else this._snapTo(flow.phase)
    }

    if (flow.phase !== this._phase) {
      const prev = this._phase
      this._phase = flow.phase
      if (mode !== 'inspect') this._handlePhaseChange(prev, flow.phase)
    }
  }

  _handlePhaseChange(prev, next) {
    const launchDriving = LAUNCH_DRIVING_STAGES.has(this.launchSequence?.stage)

    // Countdown/liftoff owns its own 0 -> 1 -> 2 progression — but only when
    // it was already flying those phases. Arriving from >= 3 (test-rig 'L'
    // restart mid-mission) still needs the stack rebuilt below.
    if (next <= 2 && prev <= 2 && launchDriving) return

    if (next >= 3 && launchDriving) {
      // Test-rig jump out of a running countdown/liftoff: take over, and
      // unlock the space stepper that would otherwise wait forever.
      this.launchSequence.interrupt()
      queueMicrotask(() => this.flowStore.completeAutoplay())
    }

    const beat = BEATS[next]
    if (next === prev + 1 && beat && beat.valid(this)) {
      this._startBeat(next, beat)
    } else {
      this._snapTo(next)
    }
  }

  _enterInspect() {
    // Inspection freezes the mission exactly where it stands — no rebuild,
    // no pad reset. Whichever stages are still attached, the CSM's current
    // state, and the current environment all stay as they are; only
    // motion/animation stops, so the explode view is a snapshot of the real
    // vehicle at this moment. Exiting re-syncs to whatever phase the flow is
    // on (via _snapTo, which correctly re-detaches/restores from scratch).
    this.launchSequence?.interrupt()
    if (this._beat) this._finishBeat()
    this._glide = null
    this._flushTweens()
    this._clearDebris()
    Object.values(this._exhausts).forEach((exhaust) => exhaust.extinguish())
    this.flash.clear()
    this._setVibe(0)
  }

  // Whether `id` (an InspectionController stageGroups key) is still part of
  // the vehicle right now — false once jettisoned, or for the LM before its
  // transposition-beat reveal. Lets inspection hide labels/exploded slots
  // for hardware that isn't actually there anymore.
  isStagePresent(id) {
    if (id === 'LM') return (this._lmGroup?.visible ?? false) && !this._detached.has('LM')
    return !this._detached.has(id)
  }

  // ---------------------------------------------------------------- beats

  _startBeat(phase, spec) {
    if (this._beat) this._finishBeat()
    this._beat = {
      phase,
      spec,
      elapsed: 0,
      from: this._captureContinuous(),
      to: SETTLED[phase],
      eventIndex: 0,
    }
  }

  _captureContinuous() {
    return {
      pos: this._flightPos.toArray(),
      tilt: this._flightTilt,
      sky: this.skyEnvironment.dome.material.uniforms.uAltitudeFactor.value,
      pad: this._padOpacity,
      env: structuredClone(this._envNow),
    }
  }

  _finishBeat() {
    const beat = this._beat
    this._beat = null
    this._flushTweens()
    this._applyContinuous(beat.from, beat.to, 1, 1)
    for (let i = beat.eventIndex; i < beat.spec.events.length; i += 1) {
      beat.spec.events[i].run(this, true)
    }
  }

  _applyContinuous(from, to, motionT, easeT) {
    this._flightPos.set(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], motionT),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], motionT),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], motionT),
    )
    this._flightTilt = THREE.MathUtils.lerp(from.tilt, to.tilt, easeT)
    this.skyEnvironment.setAltitudeFactor(THREE.MathUtils.lerp(from.sky, to.sky, easeT))
    this._setPadOpacity(THREE.MathUtils.lerp(from.pad, to.pad, easeT))

    const now = this._envNow
    for (const key of Object.keys(now)) {
      const a = from.env[key]
      const b = to.env[key]
      for (let i = 0; i < now[key].length; i += 1) {
        now[key][i] = THREE.MathUtils.lerp(a[i], b[i], easeT)
      }
    }
    this._applyEnvNow()
  }

  _applyEnv(env) {
    this._envNow = structuredClone(env)
    this._applyEnvNow()
  }

  _applyEnvNow() {
    const { earth, moon, ocean, light } = this._envNow
    this.earth?.apply(...earth)
    this.moon?.apply(...moon)
    this.ocean?.apply(...ocean)
    this.keyLight?.position.set(...light)
  }

  // ---------------------------------------------------------------- tweens

  // Minimal per-beat animation driver for objects the continuous channel
  // doesn't cover (the CSM's transposition moves). apply() receives eased
  // 0-1; _flushTweens() jumps everything to its end state so beats can be
  // fast-forwarded safely.
  _addTween(duration, apply) {
    const tween = { elapsed: 0, duration, apply }
    this._tweens.push(tween)
    return tween
  }

  _flushTweens() {
    this._tweens.forEach((tween) => tween.apply(1))
    this._tweens = []
  }

  _updateTweens(dt) {
    for (let i = this._tweens.length - 1; i >= 0; i -= 1) {
      const tween = this._tweens[i]
      tween.elapsed += dt
      const t = Math.min(tween.elapsed / tween.duration, 1)
      tween.apply(easeInOutCubic(t))
      if (t >= 1) this._tweens.splice(i, 1)
    }
  }

  // ---------------------------------------------------------------- snap

  // Aligns everything with a phase's settled state: discrete facts apply
  // immediately, continuous ones glide over ~a second so jumps don't pop.
  _snapTo(phase, { glide = true } = {}) {
    if (this._beat) this._finishBeat()
    this._flushTweens()
    const target = SETTLED[phase]

    this._clearDebris()
    this.flash.clear()
    Object.keys(this._jettisonable).forEach((id) => {
      if (id === 'CSM') return // handled by the csm layout below
      if (target.detached.includes(id)) this._detachInstant(id)
      else this._restore(id)
    })

    // CSM layout: stowed rides the stack, docked is flipped nose-onto-LM,
    // gone means it has already departed before the descent, cm is the
    // Command Module alone at its home (apex-up) transform for reentry —
    // the SM itself is handled by the detached list above.
    if (this._jettisonable.CSM) {
      if (target.csm === 'gone') {
        this._detachInstant('CSM')
      } else {
        this._restore('CSM')
        if (target.csm === 'docked') {
          const csm = this._jettisonable.CSM.object
          csm.position.y = this._dockLocalY
          csm.rotation.set(0, 0, Math.PI)
        }
      }
    }
    this._csmState = target.csm
    this._setLmVisible(target.lm)
    this._parachutes?.setDeployed(target.chutes ?? false)

    Object.entries(this._exhausts).forEach(([id, exhaust]) => {
      if (id === target.burn) {
        exhaust.ignite()
        exhaust.setStretch(target.stretch)
        if (phase >= 3) exhaust.setSmokeEnabled(false)
      } else {
        exhaust.extinguish()
      }
    })
    this._setVibe(target.burn ? 1 : 0)

    const from = this._captureContinuous()
    if (glide) {
      this._glide = { from, to: target, elapsed: 0 }
    } else {
      this._glide = null
      this._applyContinuous(from, target, 1, 1)
      this._writeRocketTransform()
    }
  }

  // ------------------------------------------------------------ hardware

  _axis() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocket.quaternion)
  }

  _setLmVisible(visible) {
    if (this._lmGroup) this._lmGroup.visible = visible
  }

  // Lunar liftoff: the descent stage stays behind as the launch pad. It is
  // parented onto the MOON group (not scene-attached debris), so when the
  // env channel shrinks/moves the Moon during the climb to orbit, the stage
  // recedes with the terrain it is standing on instead of levitating.
  _abandonToMoon(id, instant) {
    if (this._detached.has(id)) return
    const entry = this._jettisonable[id]
    if (!entry) return
    this._detached.add(id)
    if (instant || !this.moon) entry.object.removeFromParent()
    else this.moon.group.attach(entry.object)
  }

  // SLA pyro fires: the four petals start hinging outward on spring
  // thrusters. Purely visual — the discrete "SLA is gone" fact belongs to
  // _releaseSlaPanels, which is the instant-safe half of the pair.
  _openSlaPanels() {
    const entry = this._jettisonable['SLA']
    if (!entry || this._detached.has('SLA')) return

    this._slaTweens = this._slaPetals.map((petal) => {
      const hinge = petal.object
      const axis = hinge.userData.hingeAxis
      // Extra ease-out on top of the tween's cubic: pyros pop, springs bleed.
      return this._addTween(SLA_OPEN_SECONDS, (t) => {
        const punched = 1 - (1 - t) ** 2
        hinge.quaternion.setFromAxisAngle(axis, SLA_OPEN_ANGLE * punched)
      })
    })

    const panelHeight = entry.object.userData.panelHeight ?? 3.4
    const pos = entry.object
      .getWorldPosition(new THREE.Vector3())
      .addScaledVector(this._axis(), panelHeight * 0.6)
    this.flash.spawn(pos, { scale: 11, sparkSpeed: 7 })
  }

  // Spring release: at the open angle the hinges let go and each petal
  // leaves as free tumbling debris — on Apollo 11 the panels were jettisoned
  // entirely, not left hinged open. Fast-forwarding (instant) just removes
  // the closed cone; _restore('SLA') rebuilds it petal by petal.
  _releaseSlaPanels(instant) {
    if (this._detached.has('SLA')) return
    const entry = this._jettisonable['SLA']
    if (!entry) return
    this._detached.add('SLA')

    // Drop any still-running open tweens — the release pose is set exactly.
    this._tweens = this._tweens.filter((tween) => !this._slaTweens.includes(tween))
    this._slaTweens = []

    if (instant) {
      this._resetSlaPetals()
      entry.object.removeFromParent()
      return
    }

    const axisWorld = this._axis()
    for (const petal of this._slaPetals) {
      const hinge = petal.object
      hinge.quaternion.setFromAxisAngle(hinge.userData.hingeAxis, SLA_OPEN_ANGLE)
      this.scene.attach(hinge)
      const outward = hinge.userData.outward.clone().applyQuaternion(this.rocket.quaternion)
      const spinAxis = hinge.userData.hingeAxis.clone().applyQuaternion(this.rocket.quaternion)
      this._debris.push({
        object: hinge,
        velocity: this._rocketVel
          .clone()
          .multiplyScalar(0.4)
          .addScaledVector(outward, SLA_PANEL_SPEED * (0.9 + Math.random() * 0.2))
          .addScaledVector(axisWorld, 2.2), // slight forward drift, clear of the S-IVB
        spinAxis,
        spinRate: 0.55 * (0.85 + Math.random() * 0.3), // keeps tumbling the way it opened
        gravity: 0,
        maxAge: DEBRIS_MAX_AGE_SECONDS,
        age: 0,
      })
    }
    entry.object.removeFromParent() // now-empty shell group
  }

  _resetSlaPetals() {
    for (const petal of this._slaPetals) {
      this._debris = this._debris.filter((debris) => debris.object !== petal.object)
      petal.parent.add(petal.object)
      petal.object.position.copy(petal.position)
      petal.object.quaternion.copy(petal.quaternion)
      petal.object.scale.copy(petal.scale)
    }
  }

  _separate(id, instant, opts) {
    if (this._detached.has(id)) return
    const entry = this._jettisonable[id]
    if (!entry) return
    this._detached.add(id)

    if (instant) {
      entry.object.removeFromParent()
      return
    }

    this.scene.attach(entry.object)

    const axis = this._axis()
    const box = new THREE.Box3().setFromObject(entry.object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const halfAlong =
      (size.x * Math.abs(axis.x) + size.y * Math.abs(axis.y) + size.z * Math.abs(axis.z)) / 2

    if (opts.flashScale > 0) {
      const flashPos = opts.flashAtTop
        ? center.clone().addScaledVector(axis, halfAlong)
        : center.clone()
      this.flash.spawn(flashPos, { scale: opts.flashScale, sparkSpeed: opts.sparkSpeed })
    }

    const velocity = this._rocketVel
      .clone()
      .multiplyScalar(opts.along)
      .addScaledVector(axis, -opts.back)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * (opts.lateral ?? 0),
          0,
          (Math.random() - 0.5) * (opts.lateral ?? 0),
        ),
      )

    // radial: guaranteed speed perpendicular to the stack axis (random
    // direction) — for shroud-style discards that must clear the vehicle
    // sideways instead of sliding through what's above them.
    if (opts.radial) {
      const angle = Math.random() * Math.PI * 2
      const perpA = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize()
      const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize()
      velocity
        .addScaledVector(perpA, Math.cos(angle) * opts.radial)
        .addScaledVector(perpB, Math.sin(angle) * opts.radial)
    }

    const spinAxis = new THREE.Vector3(0.15 * (Math.random() - 0.5), 0, 1).normalize()
    this._debris.push({
      object: entry.object,
      velocity,
      spinAxis,
      spinRate: opts.spinRate * (0.8 + Math.random() * 0.4),
      gravity: opts.gravity ?? DEBRIS_GRAVITY,
      maxAge: opts.maxAge ?? DEBRIS_MAX_AGE_SECONDS,
      age: 0,
    })
  }

  _detachInstant(id) {
    const entry = this._jettisonable[id]
    if (!entry) return
    this._detached.add(id)
    entry.object.removeFromParent()
  }

  _restore(id) {
    const entry = this._jettisonable[id]
    if (!entry) return
    // If it's still flying as debris (e.g. Columbia rejoining at the
    // rendezvous), reclaim it from the debris list first.
    this._debris = this._debris.filter((debris) => debris.object !== entry.object)
    entry.parent.add(entry.object)
    entry.object.position.copy(entry.position)
    entry.object.quaternion.copy(entry.quaternion)
    entry.object.scale.copy(entry.scale)
    entry.object.visible = true
    this._detached.delete(id)
    // The SLA's petals leave the group as individual debris — put them back.
    if (id === 'SLA') this._resetSlaPetals()
  }

  _clearDebris() {
    this._debris.forEach((d) => d.object.removeFromParent())
    this._debris = []
  }

  _igniteFlash(stageId, scale = 15, sparkSpeed = 9) {
    const group = this._exhausts[stageId]?.group
    if (!group) return
    const pos = group.getWorldPosition(new THREE.Vector3())
    this.flash.spawn(pos, { scale, sparkSpeed })
  }

  _setVibe(gain) {
    this._vibe = gain
    this.sceneManager.setShakeGain(gain)
  }

  _setPadOpacity(opacity) {
    const clamped = THREE.MathUtils.clamp(opacity, 0, 1)
    this._padOpacity = clamped
    const solid = clamped >= 0.995
    this.launchPad.visible = clamped > 0.02
    this._padMaterials.forEach((material) => {
      material.transparent = !solid
      material.opacity = clamped
    })
  }

  // ---------------------------------------------------------------- loop

  update(dt) {
    this.flash.update(dt)
    Object.entries(this._exhausts).forEach(([id, exhaust]) => {
      if (id !== 'S-IC') exhaust.update(dt) // S-IC's is updated by SceneManager
    })

    if (this._mode === 'inspect') return

    this._time += dt
    this._parachutes?.update(dt)
    this._updateDebris(dt)
    this._updateTweens(dt)

    let owns = false
    if (this._beat) {
      owns = true
      const beat = this._beat
      beat.elapsed += dt
      const t = Math.min(beat.elapsed / beat.spec.duration, 1)
      this._applyContinuous(
        beat.from,
        beat.to,
        beat.spec.progress(t),
        (beat.spec.ease ?? easeInOutCubic)(t),
      )
      const events = beat.spec.events
      while (beat.eventIndex < events.length && events[beat.eventIndex].at <= beat.elapsed) {
        events[beat.eventIndex].run(this, false)
        beat.eventIndex += 1
      }
      if (t >= 1 && beat.eventIndex >= events.length && this._tweens.length === 0) {
        this._beat = null
      }
    } else if (this._glide) {
      owns = true
      const glide = this._glide
      glide.elapsed += dt
      const t = Math.min(glide.elapsed / GLIDE_SECONDS, 1)
      const eased = easeInOutCubic(t)
      this._applyContinuous(glide.from, glide.to, eased, eased)
      if (t >= 1) this._glide = null
    } else if (this._phase >= 3) {
      owns = true // settled high-phase state: keep vibration alive
    }

    if (owns) this._writeRocketTransform(dt)
  }

  _writeRocketTransform(dt = 0) {
    // Engine-on vibration: high-frequency sub-meter jitter. The camera
    // follows the smoothed rocket position, so this reads as airframe
    // rumble rather than the whole frame shaking.
    const amp = 0.22 * this._vibe
    const t = this._time
    const jx = amp * (Math.sin(t * 47.3) + 0.5 * Math.sin(t * 71.7))
    const jy = amp * 0.5 * Math.sin(t * 53.9)
    const jz = amp * (Math.sin(t * 43.1 + 1.7) + 0.5 * Math.sin(t * 67.3))

    this.rocket.position.set(
      this._flightPos.x + jx,
      this._flightPos.y + jy,
      this._flightPos.z + jz,
    )
    this.rocket.rotation.set(0, 0, -this._flightTilt + amp * 0.008 * Math.sin(t * 31.7))

    if (dt > 0) {
      // Smoothed flight velocity — seeds separation debris so spent stages
      // inherit the vehicle's motion instead of stopping dead.
      const instVel = this._flightPos.clone().sub(this._prevFlightPos).divideScalar(dt)
      this._rocketVel.lerp(instVel, Math.min(dt * 6, 1))
    }
    this._prevFlightPos.copy(this._flightPos)
  }

  _updateDebris(dt) {
    for (let i = this._debris.length - 1; i >= 0; i -= 1) {
      const debris = this._debris[i]
      debris.age += dt
      debris.velocity.y -= debris.gravity * dt
      debris.object.position.addScaledVector(debris.velocity, dt)
      debris.object.rotateOnWorldAxis(debris.spinAxis, debris.spinRate * dt)

      const distance = debris.object.position.distanceTo(this.rocket.position)
      if (debris.age > debris.maxAge || distance > DEBRIS_MAX_DISTANCE) {
        debris.object.removeFromParent()
        this._debris.splice(i, 1)
      }
    }
  }

  dispose() {
    this._unsubscribe()
    this.flash.dispose()
    Object.entries(this._exhausts).forEach(([id, exhaust]) => {
      if (id !== 'S-IC') exhaust.dispose() // S-IC's is owned by SceneManager
    })
    this._clearDebris()
  }
}
