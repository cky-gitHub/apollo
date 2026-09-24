import * as THREE from 'three'
import { ExhaustSystem, EXHAUST_PRESETS } from '../particles/ExhaustSystem.js'
import { SeparationFlash } from '../particles/SeparationFlash.js'
import { Parachutes } from '../rocket/Parachutes.js'
import { bodyMark, groundMark, lerpBodyMark, EARTH_BODY, MOON_BODY } from '../missionSpace.js'
import { PHASES } from '../../data/phases.js'

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

// Columbia's parking orbit while Eagle descends and sits on the surface
// (phases 9-10, and the start of beat 11 until the rendezvous restore): the
// CSM is NOT debris and NOT absent — it circles the live Moon center so it
// stays honest through every env lerp (the same reason _abandonToMoon
// parents the descent stage onto the Moon group). The track skims low over
// the -z/-x horizon that the surface cameras actually frame; that quadrant
// is toward the low sun, so the craft itself is backlit — a small additive
// glint sprite rides it, which is also what a sunlit spacecraft against the
// lunar sky genuinely reads as: a slowly moving star.
const CSM_ORBIT_ALTITUDE = 450 // world units above the rendered surface
const CSM_ORBIT_RATE = 0.012 // rad/s along the orbit (~9 min per lap)
const CSM_ORBIT_BLEND_SECONDS = 10 // ease from the undocking push onto the track
// Pass geometry, solved against the phase-9/10 groundMark moon (center
// (980,-379,0), surface radius 2550) and the surface camera poses: the peak
// of the visible pass sits ~6 deg above the horizon toward (-x,-z).
const CSM_ORBIT_U = new THREE.Vector3(-0.45 * 1347, 2550 + 0.1 * 1347, -0.88 * 1347).normalize()
const CSM_ORBIT_V = new THREE.Vector3(1, 0, -0.25)
  .addScaledVector(CSM_ORBIT_U, -new THREE.Vector3(1, 0, -0.25).dot(CSM_ORBIT_U))
  .normalize()
const CSM_ORBIT_START_THETA = -0.1 // just short of the visible peak

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// Small additive sun-glint sprite that rides the orbiting Columbia: the
// surface cameras frame it low over the horizon toward the sun, where the
// model itself is a backlit silhouette — a bright moving point is both the
// only thing that reads at that range and what a sunlit spacecraft against
// the lunar sky really looks like.
function buildCsmGlint() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,250,235,0.9)')
  g.addColorStop(0.45, 'rgba(255,235,200,0.25)')
  g.addColorStop(1, 'rgba(255,225,180,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    }),
  )
  sprite.name = 'csm-orbit-glint'
  sprite.scale.setScalar(46)
  return sprite
}

// The vehicle only translates while something is actually firing — no
// engine, no motion, full stop, even mid-coast. Every beat's `progress`
// (the position channel — see _applyContinuous's motionT) is therefore
// holdThenEase()'d to the beat's own ignite()/extinguish() event window(s):
// flat at the "from" position until ignition, easing to the "to" position
// across the burn, flat there for any coast afterward. Beats that burn
// continuously start-to-end (no ignite/extinguish inside them, e.g. 3, 5)
// just use easeInOutCubic across the whole beat, unchanged.

// Env-channel timing for beats that embed a jettison: holds Earth/Moon/light
// perfectly flat through the drop (a discrete event with no real bearing on
// position) and only eases once the vehicle is back to steady flight —
// so apparent distance never visibly shifts at the moment hardware
// separates. holdT/endT are fractions of the beat's total duration.
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function holdThenEase(holdT, endT = 1) {
  return (t) => easeInOutCubic(Math.max(0, Math.min(1, (t - holdT) / (endT - holdT))))
}

// Environment staging per phase: Earth/Moon [x, y, z, scale, opacity] and
// the key light's position (sun direction). Every Earth/Moon tuple is now
// COMPUTED from the real-scale mission model in missionSpace.js — true
// distances (the same phases.js anchors the HUD spools) compressed to render
// range with true apparent angular size preserved — instead of hand-tuned
// numbers. What stays authored per phase is the DIRECTION each body sits in,
// following one world-axis convention: the Moon always on the +X side of the
// sky, Earth on the -X side or underfoot (it IS the ground for 0-6 and 13).
//
// The key light IS the visible Sun (environment/Sun.js locks the disc to
// this vector every frame), so the light direction has to read as a real sun
// you can find in the sky:
//  - LIGHT_SPACE lights the coast phases from up and to the camera side, so
//    Earth/Moon show a clear gibbous terminator (legibly lit from one place)
//    while the hero vehicle stays bright. The disc itself sits off-frame,
//    behind the shoulder — which is exactly why a near-full Earth reads as
//    sunlit rather than flat.
//  - LIGHT_SURFACE (phases 9-10) drops the Sun low in front, just over the
//    lunar horizon: the disc is in frame, the regolith rakes into long
//    shadows, and the LM throws a shadow toward the camera — the iconic
//    Tranquility Base light. The vehicle goes side/back-lit, so the fill
//    (SceneManager.fillLight) is lifted to keep it readable.
const LIGHT_HOME = [180, 220, 120]
const LIGHT_SPACE = [1600, 1700, 2500]
const LIGHT_SURFACE = [-880, 60, -3280]

// Vehicle attitude: the settled rocket orientation is (tilt, yaw) — tilt
// leans the stack off vertical (rotation about -z), yaw then swings that
// lean around the world +Y axis ('YZX' euler order, set on the rocket group
// at construction). Stack axis = (sin·cos(yaw), cos(tilt), -sin·sin(yaw)).
// aim() converts a world direction into those angles, so a phase can point
// the stack's +Y axis AT something — which is how the coast phases keep the
// spacecraft facing where it is actually going instead of a generic in-plane
// lean (tilt alone can never point at a body with a z component, and every
// cislunar body mark has one).
const aim = ([x, y, z]) => {
  const len = Math.hypot(x, y, z)
  return { tilt: Math.acos(y / len), yaw: Math.atan2(-z, x) }
}

// ONE Earth-Moon line for the whole flight, fixed in world space.
//
// This used to be a per-phase set of hand-picked directions (Moon at +z in
// phase 7, -z in 8, Earth flipping sides again for 12), so every phase change
// swung the bodies across the sky. Now the Moon always sits along MOON_LINE
// and Earth along EARTH_LINE = -MOON_LINE: outbound, Earth is behind and the
// Moon ahead; at the Moon, Earth hangs in that same patch of sky; on the way
// home it is ahead again. Only distances change between phases - the bodies
// grow and shrink, they do not wander. The lunar-surface phases are the one
// exception, where the Moon is underfoot as terrain.
//
// The line is chosen against LIGHT_SPACE (nearly perpendicular to it) so that
// both an Earth-facing and a Moon-facing camera see a lit, gibbous body, and
// with the Moon on the -z side so the default +z-side cameras face it.
const MOON_LINE = [0.803, -0.199, -0.562]
const EARTH_LINE = [-MOON_LINE[0], -MOON_LINE[1], -MOON_LINE[2]]

// From phase 7 to 12 the vehicle does NOT travel. It used to move hundreds of
// units between phases, and the camera - a smoothed chase - lagged far enough
// behind to lose it (TEI played for seconds on an empty frame). The journey
// is carried entirely by the bodies around it; burns read through the plume.
const FLIGHT_POS = [760, 2510, 0]

// Attitudes, as stack +Y directions (see aim()):
//  - 7, T&D: square to the Earth-Moon line, so the docking plays side-on
//    with Earth behind it. Reached by a real post-TLI attitude manoeuvre
//    (39 deg from the TLI attitude) BEFORE the SLA opens.
//  - 8, LOI: +Y (the SPS end, forward after the transposition flip) along
//    MOON_LINE - engine-first into the braking burn.
//  - 11, docked in lunar orbit: pitched halfway between vertical and the
//    Moon line, reached during the ascent burn.
//  - 12, TEI: +Y along MOON_LINE again, i.e. the CM apex leads home while the
//    SPS points back at the Moon - the real TEI attitude.
const ATT_7 = [0.499, 0.741, 0.45]
const AIM_7 = aim(ATT_7)
const AIM_8 = aim(MOON_LINE)
const AIM_11 = aim([0.634, 0.633, -0.444])
const AIM_12 = aim(MOON_LINE)

// The Pacific recovery zone only exists for phase 13 — every other phase
// holds it at the splash site with opacity 0 so the reveal is a fade under
// the descending CM. The site sits at -X of the pad origin because the
// return leg flies -X (back past where it left from) — see SETTLED[12/13].
//
// SPLASH_DY lifts the whole recovery scene (ocean, ground-Earth, capsule) by
// the same amount the TEI position was raised when the flight stopped
// travelling, so the 12->13 dive keeps the exact vector it was tuned with.
const SPLASH_SITE_X = 60
const SPLASH_DY = 910
const OCEAN_HIDDEN = [SPLASH_SITE_X, 40 + SPLASH_DY, 0, 1, 0]

// Earth as the ground: a fixed full-ground-radius sphere whose top surface
// sits just below pad grade (LaunchPad GRADE_Y = -22 — the island terrain,
// NOT the y=0 MLP deck), CONSTANT through phases 0-6. The pad literally
// stands on it, so liftoff -> ascent is one continuous ground -> curvature
// -> globe reveal with no swap: at pad height the flat terrain hides it, by
// Max-Q its limb is the horizon under the stack, and the 6->7 T&D beat
// lerps it out to its true-angular-size marble.
const EARTH_AT_PAD = groundMark(EARTH_BODY, 0, 0, -24)

// The Moon hangs at one fixed spot in the launch sky — +X side (the gravity
// turn flies toward it), low over the Atlantic — as the true-angular-size
// dot it really is from 384,400 km out. Kept ~66° from the LIGHT_HOME sun
// direction so the dot shows a lit half; nearer the sun it renders as an
// invisible new-moon crescent (found the hard way). Ascent phases re-derive
// the direction from each vehicle position toward this same anchor so
// parallax stays honest.
const MOON_SKY_DIR = [0.75, 0.28, -0.6]
const MOON_SKY_ANCHOR = bodyMark(MOON_BODY, [0, 0, 0], MOON_SKY_DIR, PHASES[0].distMoonKm)
const moonInLaunchSky = (vehiclePos, phase) =>
  bodyMark(
    MOON_BODY,
    vehiclePos,
    [
      MOON_SKY_ANCHOR[0] - vehiclePos[0],
      MOON_SKY_ANCHOR[1] - vehiclePos[1],
      MOON_SKY_ANCHOR[2] - vehiclePos[2],
    ],
    PHASES[phase].distMoonKm,
  )

const ENV_HOME = {
  earth: EARTH_AT_PAD,
  moon: moonInLaunchSky([0, 0, 0], 0),
  ocean: OCEAN_HIDDEN,
  light: LIGHT_HOME,
}

// Ascent (phases 3-6): Earth stays put underfoot — the vehicle climbing away
// from a FIXED globe is what makes looking back read as one continuous
// space. Only the Moon dot gets re-anchored per phase (parallax).
const ascentEnv = (vehiclePos, phase) => ({
  earth: EARTH_AT_PAD,
  moon: moonInLaunchSky(vehiclePos, phase),
  ocean: OCEAN_HIDDEN,
  light: LIGHT_HOME,
})
const ENV_ASCENT = {
  3: ascentEnv([24, 420, 0], 3),
  4: ascentEnv([110, 950, 0], 4),
  5: ascentEnv([300, 1550, 0], 5),
  6: ascentEnv([560, 2150, 0], 6),
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
  { pos: [24, 420, 0], tilt: 12 * DEG, burn: 'S-IC', sky: 0.62, pad: 0, stretch: 2.0, detached: [], csm: 'stowed', lm: false, env: ENV_ASCENT[3] },
  { pos: [110, 950, 0], tilt: 27 * DEG, burn: 'S-II', sky: 0.85, pad: 0, stretch: 1.5, detached: ['S-IC'], csm: 'stowed', lm: false, env: ENV_ASCENT[4] },
  { pos: [300, 1550, 0], tilt: 45 * DEG, burn: 'S-II', sky: 1, pad: 0, stretch: 1.8, detached: ['S-IC', 'LES'], csm: 'stowed', lm: false, env: ENV_ASCENT[5] },
  { pos: [560, 2150, 0], tilt: 63 * DEG, burn: 'S-IVB', sky: 1, pad: 0, stretch: 1.7, detached: ['S-IC', 'LES', 'S-II'], csm: 'stowed', lm: false, env: ENV_ASCENT[6] },
  // 7: T&D, ~22,000 km out. Earth recedes from the ground-globe to its true
  // 13 deg-radius marble behind the stack, the Moon a dot on the far side of
  // the same line.
  {
    pos: FLIGHT_POS, tilt: AIM_7.tilt, yaw: AIM_7.yaw, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'docked', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[7].distEarthKm),
      moon: bodyMark(MOON_BODY, FLIGHT_POS, MOON_LINE, PHASES[7].distMoonKm),
      ocean: OCEAN_HIDDEN, light: LIGHT_SPACE,
    },
  },
  // 8: lunar orbit insertion, 100 km up — the Moon terrain-close ahead along
  // the line (ground-radius clamp), Earth a 2 deg marble far behind on it.
  {
    pos: FLIGHT_POS, tilt: AIM_8.tilt, yaw: AIM_8.yaw, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'docked', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[8].distEarthKm),
      moon: bodyMark(MOON_BODY, FLIGHT_POS, MOON_LINE, PHASES[8].distMoonKm),
      ocean: OCEAN_HIDDEN, light: LIGHT_SPACE,
    },
  },
  // 9: the Moon as standing terrain — full ground-radius sphere whose top
  // surface sits exactly under the LM's footpads (stack-local y=91) at the
  // flight position. Earth stays on its line: low in the sky over the
  // horizon, on the camera side (LIGHT_SURFACE puts the sun low at -z, and
  // an Earth opposite the sun would render as an unlit sliver).
  {
    pos: FLIGHT_POS, tilt: 0, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'gone', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[9].distEarthKm),
      moon: groundMark(MOON_BODY, FLIGHT_POS[0], FLIGHT_POS[2], FLIGHT_POS[1] + 91),
      ocean: OCEAN_HIDDEN, light: LIGHT_SURFACE,
    },
  },
  // 10: Tranquility Base — identical vehicle/env state to touchdown; the
  // phase exists as a held tableau (camera re-frame + HUD beat), so there is
  // deliberately no BEATS[10] entry.
  {
    pos: FLIGHT_POS, tilt: 0, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB'], csm: 'gone', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[10].distEarthKm),
      moon: groundMark(MOON_BODY, FLIGHT_POS[0], FLIGHT_POS[2], FLIGHT_POS[1] + 91),
      ocean: OCEAN_HIDDEN, light: LIGHT_SURFACE,
    },
  },
  // 11: ascent & rendezvous — the ascent stage climbs off the descent-stage
  // launch pad (abandoned onto the Moon group so it recedes WITH the
  // terrain), then Columbia rejoins and docks. Settled = docked in orbit,
  // the Moon below and a little ahead, Earth still on its line.
  {
    pos: FLIGHT_POS, tilt: AIM_11.tilt, yaw: AIM_11.yaw, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS'], csm: 'docked', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[11].distEarthKm),
      moon: bodyMark(MOON_BODY, FLIGHT_POS, [0.3, -1, -0.5], PHASES[11].distMoonKm),
      ocean: OCEAN_HIDDEN, light: LIGHT_SPACE,
    },
  },
  // 12: trans-Earth injection, 3,200 km out. Earth a dot ahead on its line,
  // the still-huge Moon falling away behind on its own.
  {
    pos: FLIGHT_POS, tilt: AIM_12.tilt, yaw: AIM_12.yaw, burn: null, sky: 1, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS', 'LM'], csm: 'docked', lm: true,
    env: {
      earth: bodyMark(EARTH_BODY, FLIGHT_POS, EARTH_LINE, PHASES[12].distEarthKm),
      moon: bodyMark(MOON_BODY, FLIGHT_POS, MOON_LINE, PHASES[12].distMoonKm),
      ocean: OCEAN_HIDDEN, light: LIGHT_SPACE,
    },
  },
  // 13: reentry & splashdown — SM jettisoned, blunt-end-forward entry, sky
  // fades back to blue while the ocean fades in; settles bobbing on the
  // water under deployed mains. pos.y puts the CM's heat shield at the
  // ocean surface given the CM's ~97m stack-local height. Arrival mirrors
  // departure: Earth comes back as GROUND (sphere top at the ocean surface
  // under the splash site — the ocean disc is its local terrain patch, same
  // role the pad played), and the Moon is once again the small daytime-sky
  // dot it was on the pad. Everything here is lifted by SPLASH_DY.
  {
    pos: [SPLASH_SITE_X, -58 + SPLASH_DY, 0], tilt: 0, burn: null, sky: 0, pad: 0, stretch: 1,
    detached: ['S-IC', 'LES', 'S-II', 'SLA', 'S-IVB', 'LM-DS', 'LM', 'SM'], csm: 'cm', lm: true, chutes: true,
    env: {
      // Sphere top tucked below the ocean disc so the disc is the water
      // surface and the sphere takes over past its 3200 rim.
      earth: groundMark(EARTH_BODY, SPLASH_SITE_X, 0, 34 + SPLASH_DY),
      moon: bodyMark(MOON_BODY, [SPLASH_SITE_X, -58 + SPLASH_DY, 0], [0.6, 0.55, -0.5], PHASES[13].distMoonKm),
      ocean: [SPLASH_SITE_X, 40 + SPLASH_DY, 0, 1, 1], light: [2600, 1600, 1000],
    },
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
  // snap out, the vehicle holds dead still through the silent coast, retro
  // flash, the spent stage tumbles away below, then the J-2s light up blue
  // and it's moving again.
  4: {
    duration: 7.5,
    // S-IC is already out by this beat's t=0 (its extinguish() is the first
    // event below); S-II doesn't light until 2.05s. Frozen until then.
    progress: holdThenEase(2.05 / 7.5, 1),
    // Hold Earth/Moon flat through the S-IC drop (0.55s) with a buffer, only
    // easing once S-II is burning steady.
    envEase: holdThenEase(1.0 / 7.5),
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
    // Hold through the LES tower jettison (2.6s) with a buffer.
    envEase: holdThenEase(0.5),
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
    // Same shape as beat 4: dead still through the coast, S-IVB doesn't
    // light until 2.1s.
    progress: holdThenEase(2.1 / 7.5, 1),
    // Hold Earth/Moon flat through the S-II drop (0.6s) with a buffer, only
    // easing once the S-IVB is burning steady for TLI.
    envEase: holdThenEase(1.0 / 7.5),
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
  // 6 -> 7: TLI cutoff, then transposition & docking. The Earth (already in
  // frame since ascent) settles back from the receding limb into its cruise
  // marble while the Moon fades in behind. The long, quiet centerpiece: the
  // SLA's four petal panels blow apart and spring away tumbling, exposing the
  // LM on the S-IVB; the CSM pulls ahead, flips end-over-end, glides back to
  // dock nose-to-nose; and finally the spent S-IVB (carrying the SLA's fixed
  // aft ring) drifts away below — the extraction, seen from the LM's side.
  7: {
    duration: 19.3,
    // The S-IVB is still burning off its last 0.9s of TLI at this beat's
    // start (extinguish() below) — that's the whole position move. The
    // vehicle then holds dead still in world space for the rest of the
    // beat while the SLA/CSM/S-IVB choreography plays out in front of a
    // stationary camera — no engine fires again until beat 8's SPS.
    progress: holdThenEase(0, 0.9 / 19.3),
    // The post-TLI attitude manoeuvre, 1.2-4.4s: the S-IVB turns the stack
    // square to the Earth-Moon line while Earth recedes behind it, and ALL
    // of it is finished before the SLA pyros fire at 4.7s. From then on
    // nothing moves but the hardware being handled: the stack holds its
    // attitude and the backdrop holds still through the whole docking.
    ease: holdThenEase(1.2 / 19.3, 4.4 / 19.3),
    envEase: holdThenEase(1.0 / 19.3, 4.4 / 19.3),
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
        at: 4.7,
        run: (c, instant) => {
          // Pyro: the joints between the petals sever and the panels start
          // hinging outward — which is also the moment the LM first shows.
          c._setLmVisible(true)
          if (!instant) c._openSlaPanels()
        },
      },
      { at: 6.0, run: (c, instant) => c._releaseSlaPanels(instant) },
      {
        at: 7.0,
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
        at: 10.0,
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
        at: 14.0,
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
        at: 17.2,
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
        at: 18.1,
        run: (c, instant) =>
          c._separate('S-IVB', instant, {
            // The real S-IVB made a lateral evasive maneuver and went on to
            // a lunar slingshot — it did NOT fall back toward Earth. Radial-
            // dominant departure so it veers off the Earth-Moon axis instead
            // of drifting down-stack toward the Earth marble behind.
            along: 0.4,
            back: 2,
            radial: 7,
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
    duration: 11,
    // Coasting toward the Moon, dead still, until the SPS lights (3.2s);
    // frozen again once it cuts off (8.4s) for the rest of the approach.
    progress: holdThenEase(3.2 / 11, 8.4 / 11),
    // Turn engine-first onto the Moon line (0.2-3.0s) BEFORE the burn, not
    // during it; the Moon then swells ahead through the approach and burn.
    ease: holdThenEase(0.2 / 11, 3.0 / 11),
    envEase: holdThenEase(0.4 / 11, 8.4 / 11),
    valid: (c) => c._csmState === 'docked' && c._detached.has('S-IVB'),
    events: [
      {
        at: 3.2,
        run: (c, instant) => {
          c._exhausts['SPS'].ignite()
          c._exhausts['SPS'].setStretch(1)
          c._setVibe(0.45)
          if (!instant) c._igniteFlash('SPS', 8, 5)
        },
      },
      {
        at: 8.4,
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
    // Undocked but coasting, dead still, until the DPS lights (2.2s); the
    // actual powered descent is what moves the vehicle, and it holds flat
    // again once the DPS cuts off (17.6s) so touchdown lands on a settled
    // vehicle. Orientation/environment settle a touch earlier still (78%)
    // so the ground has stopped moving before contact.
    progress: holdThenEase(2.2 / 20, 17.6 / 20),
    ease: (t) => easeInOutCubic(Math.min(t / 0.78, 1)),
    // Distance-to-Moon is meant to close continuously through the whole
    // descent — only held briefly so the CSM undocking (1.0s) doesn't
    // coincide with any of that motion.
    envEase: holdThenEase(0.08, 0.78),
    valid: (c) => c._csmState === 'docked',
    events: [
      {
        at: 1.0,
        run: (c, instant) => {
          c._csmState = 'gone'
          // Columbia doesn't tumble away as debris — it stays in lunar orbit
          // (visible circling the Moon through the descent and the surface
          // stay), departing forward off the LM's roof and easing onto the
          // parking track.
          c._csmToOrbit(instant)
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
    // Dead still on the pad until the APS lights (0.6s); the ascent burn is
    // what climbs it to orbit, and it holds flat again once APS cuts off
    // (8.6s) — Columbia's rendezvous/dock afterward is all relative motion
    // on the CSM's own tweens, not the vehicle translating.
    progress: holdThenEase(0.6 / 18, 8.6 / 18),
    // Pitch-over and the Moon falling away both belong to the ascent burn
    // (0.6-8.6s). They used to run on to the very end of the beat, so the
    // stack was still turning while Columbia docked with it.
    ease: holdThenEase(0.6 / 18, 8.6 / 18),
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
        at: 8.8,
        run: (c, instant) => {
          // Columbia rejoins along the docking axis from well out of frame
          // and brakes into contact: fast at first, crawling at the end, the
          // way a final approach reads. It used to be restored only 46 units
          // out - inside the shot - so it simply appeared. The dock event
          // below is the instant-safe hard set.
          if (instant) return
          c._restore('CSM')
          const csm = c._jettisonable['CSM']?.object
          if (!csm) return
          csm.rotation.set(0, 0, Math.PI)
          const fromY = c._dockLocalY + 170
          csm.position.y = fromY
          c._addTween(
            6.4,
            (t) => {
              csm.position.y = THREE.MathUtils.lerp(fromY, c._dockLocalY + 1.2, t)
            },
            easeOutCubic,
          )
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
    // Dead still through the Eagle jettison and the quiet beat after it;
    // the SPS burn (3.0s-9.6s) is the whole move, same window the env
    // channel below tracks.
    progress: holdThenEase(3.0 / 12, 9.6 / 12),
    // Once Eagle is clear, the stack turns onto the Moon line (1.4-2.9s) so
    // the SPS fires from a settled attitude, not mid-turn.
    ease: holdThenEase(1.4 / 12, 2.9 / 12),
    // Held flat through the Eagle jettison (0.9s); Earth/Moon only start
    // trading places once the SPS actually lights (3.0s) for the real TEI
    // burn, settling by cutoff (9.6s) — the distance change tracks the burn,
    // not the LM drop.
    envEase: holdThenEase(3.0 / 12, 9.6 / 12),
    valid: (c) => c._csmState === 'docked' && c._detached.has('LM-DS') && !c._detached.has('LM'),
    events: [
      {
        at: 0.9,
        run: (c, instant) =>
          c._separate('LM', instant, {
            // Eagle stays in lunar orbit — it must clear down-stack (dock
            // geometry) but should read as staying with the Moon behind us,
            // not racing ahead toward Earth, so the push is radial-dominant.
            along: 0.3,
            back: 1.5,
            radial: 6,
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
  // 12 -> 13: reentry and splashdown — the finale. The whole TEI-to-entry
  // distance closes FIRST, in a fast opening swoop back to Earth (envEase
  // below); only once Earth already reads close/ground-scale does the
  // Service Module cut loose — the mission's last jettison — followed by
  // the blunt-end-forward flip, the atmosphere sheathing the CM in plasma,
  // mains out, and the mission ending bobbing in the Pacific. Earlier this
  // had the SM separating at 0.8s, before Earth had moved at all off its
  // TEI-coast distance (env didn't start easing until 1.3s) — the jettison
  // read as happening in deep space, with Earth then visibly rushing in
  // right after. Swapping the order (fast approach, then jettison once
  // close) fixes that.
  13: {
    duration: 26,
    // No propulsive engine fires again after the SM (and its SPS) is cut
    // loose, but the vehicle still very much translates this beat: unlike
    // the quiet coasts elsewhere in the mission, reentry is the capsule
    // visibly falling the whole way down. PLASMA — coded as an ignite()/
    // extinguish() exhaust like every real engine — is the signal for when
    // that fall actually happens: held flat through the graceful Earth
    // approach, the SM jettison, and the blunt-end-forward flip (nothing
    // yet demands the vehicle move — env alone carries "we've arrived"),
    // then eases from entry interface (PLASMA ignite, 14.5s) down to the
    // splashdown site, landing almost exactly on the splashdown-dust event
    // (25s) instead of leaving the capsule dangling under full canopy with
    // no ocean under it (verified broken this way once already).
    progress: holdThenEase(14.5 / 26, 25 / 26),
    // Orientation (the blunt-end-forward untilt) still eases on its own
    // clock; sky/ocean fade with it. Settles at 78% — same pattern as the
    // lunar touchdown.
    ease: (t) => easeInOutCubic(Math.min(t / 0.78, 1)),
    // Distance-to-Earth closes in one graceful swoop (0 -> 8.3s) that
    // finishes well before the SM jettison (9.0s) — Earth is already
    // sitting there close and steady by the time the split happens, so the
    // discrete separation event doesn't itself read as changing the range
    // home (same principle as every other embedded-jettison beat, just
    // with the ease BEFORE the drop instead of after it).
    envEase: holdThenEase(0, 0.32),
    valid: (c) => c._csmState === 'docked' && c._detached.has('LM') && !c._detached.has('SM'),
    events: [
      {
        at: 9.0,
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
        at: 10.5,
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
        at: 14.5,
        run: (c) => {
          c._exhausts['PLASMA']?.ignite()
          c._exhausts['PLASMA']?.setStretch(1)
          c._setVibe(1.15)
        },
      },
      { at: 19.5, run: (c) => c._exhausts['PLASMA']?.setStretch(0.35) },
      {
        at: 21.0,
        run: (c) => {
          c._exhausts['PLASMA']?.extinguish()
          c._setVibe(0.25)
        },
      },
      {
        at: 22.3,
        run: (c, instant) => {
          if (instant) return // settled chutes flag applies the final state
          c._addTween(2.6, (t) => c._parachutes?.setProgress(t))
        },
      },
      {
        at: 25.0,
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
    this._csmOrbit = null
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
    this._flightYaw = 0
    // Tilt (about -z) is applied FIRST, then yaw swings it around world +Y —
    // see the aim() helper above. With yaw 0 this is identical to the old
    // z-only lean, so phases without an aim are unaffected.
    rocket.rotation.order = 'YZX'
    this._envNow = structuredClone(ENV_HOME)
    // Push the home env to the scene NOW: the ground-Earth and the launch-sky
    // Moon dot must exist from frame 0. Without this, nothing applies the env
    // until the first beat/glide (LaunchSequence owns phases 0-2 without one),
    // and the ground sphere would pop in at the start of the Max-Q beat.
    this._applyEnvNow()

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
    // Inspection is a true FREEZE-FRAME of the mission, mid-beat included:
    // nothing is finished, cleared, or extinguished. The beat/glide/tweens/
    // debris simply stop advancing (update() early-returns in inspect mode),
    // so whatever is attached, tumbling, or burning stays exactly where it
    // is — the environment, backdrop bodies, and lighting are untouched, and
    // still-firing engines keep their plumes alive on the frozen vehicle.
    // Only LaunchSequence needs an explicit interrupt (it writes
    // rocket.position every frame from SceneManager._animate regardless of
    // mode). Exiting re-syncs to the flow phase via _snapTo, whose
    // _finishBeat() fast-forwards any paused beat instant-safely.
    this.launchSequence?.interrupt()
  }

  // Whether `id` (an InspectionController stageGroups key) is still part of
  // the vehicle right now — false once jettisoned, or for the LM before its
  // transposition-beat reveal. Lets inspection hide labels/exploded slots
  // for hardware that isn't actually there anymore.
  isStagePresent(id) {
    if (id === 'LM') return (this._lmGroup?.visible ?? false) && !this._detached.has('LM')
    return !this._detached.has(id)
  }

  // Whether the current phase's beat/glide/tweens have all finished — used
  // by MissionAutoplay to know it's safe to step to the next phase without
  // cutting the current one short.
  isSettled() {
    return !this._beat && !this._glide && this._tweens.length === 0
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
      yaw: this._flightYaw,
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

  // envEaseT is a SEPARATE channel from easeT (defaults to it): most beats
  // don't need the distinction, but ones with an embedded jettison hold
  // envEaseT at 0 through the drop via holdThenEase() while tilt/sky/pad
  // keep easing normally — otherwise the Earth/Moon marks would visibly
  // shift at the exact instant hardware separates, which reads as the drop
  // itself somehow changing the vehicle's distance from either body.
  _applyContinuous(from, to, motionT, easeT, envEaseT = easeT) {
    this._flightPos.set(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], motionT),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], motionT),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], motionT),
    )
    this._flightTilt = THREE.MathUtils.lerp(from.tilt, to.tilt, easeT)
    this._flightYaw = THREE.MathUtils.lerp(from.yaw ?? 0, to.yaw ?? 0, easeT)
    this.skyEnvironment.setAltitudeFactor(THREE.MathUtils.lerp(from.sky, to.sky, easeT))
    // Front-load the pad fade: it must be gone by ~40% of the 2->3 Max-Q beat,
    // BEFORE the ascent Earth swells in, or the fading flat pad terrain reads
    // as a translucent shelf cutting across the curved globe. Only the pad
    // channel is accelerated; everything else keeps the beat's easing.
    const padT = Math.min(1, easeT / 0.4)
    this._setPadOpacity(THREE.MathUtils.lerp(from.pad, to.pad, padT))

    // Earth and the Moon blend AROUND the vehicle - direction, gap and size
    // - not along a straight line through space (see lerpBodyMark); ocean
    // and light are plain values and lerp as numbers.
    const now = this._envNow
    for (const key of Object.keys(now)) {
      const a = from.env[key]
      const b = to.env[key]
      if (key === 'earth' || key === 'moon') {
        const body = key === 'earth' ? EARTH_BODY : MOON_BODY
        now[key] = lerpBodyMark(body, a, from.pos, b, to.pos, envEaseT)
        continue
      }
      for (let i = 0; i < now[key].length; i += 1) {
        now[key][i] = THREE.MathUtils.lerp(a[i], b[i], envEaseT)
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
  _addTween(duration, apply, easing = easeInOutCubic) {
    const tween = { elapsed: 0, duration, apply, easing }
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
      tween.apply(tween.easing(t))
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
    // gone means it has departed to its lunar parking orbit (kept visibly
    // circling the Moon — see _csmToOrbit), cm is the Command Module alone
    // at its home (apex-up) transform for reentry — the SM itself is
    // handled by the detached list above.
    if (this._jettisonable.CSM) {
      if (target.csm === 'gone') {
        this._csmToOrbit(true)
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

  // Columbia enters its lunar parking orbit. The CSM leaves the stack but —
  // unlike spent hardware — is NOT debris: _updateCsmOrbit drives it in a
  // circle around the LIVE Moon center every frame, so it keeps circling
  // correctly through env lerps and phase jumps. From a beat (instant=false)
  // it departs off the LM's roof with a small push and eases onto the track
  // over CSM_ORBIT_BLEND_SECONDS; from a jump/glide it's placed on the
  // track directly. Idempotent: an existing orbit is left running.
  _csmToOrbit(instant) {
    if (this._csmOrbit) return
    const entry = this._jettisonable['CSM']
    if (!entry) return
    const csm = entry.object

    if (!this._detached.has('CSM')) this._detached.add('CSM')
    this._debris = this._debris.filter((debris) => debris.object !== csm)
    if (csm.parent) this.scene.attach(csm)
    else {
      // Was removed outright (a previous phase's instant detach) — bring it
      // back under the scene root with its home scale; position/orientation
      // are overwritten by the orbit update below.
      this.scene.add(csm)
      csm.scale.copy(entry.scale)
    }

    this._csmOrbit = {
      theta: CSM_ORBIT_START_THETA,
      time: instant ? CSM_ORBIT_BLEND_SECONDS : 0,
      startPos: csm.getWorldPosition(new THREE.Vector3()),
      startQuat: csm.quaternion.clone(),
      // Departure drift blended against the orbit track: forward off the
      // LM's roof plus a share of the vehicle's motion, like the old
      // separation push.
      vel: this._rocketVel.clone().multiplyScalar(0.2).addScaledVector(this._axis(), 7),
    }

    if (!instant) {
      const pos = csm.getWorldPosition(new THREE.Vector3())
      this.flash.spawn(pos, { scale: 7, sparkSpeed: 4 })
    }

    if (!this._csmGlint) this._csmGlint = buildCsmGlint()
    this.scene.add(this._csmGlint)
    this._updateCsmOrbit(0)
  }

  _endCsmOrbit() {
    if (!this._csmOrbit) return
    this._csmOrbit = null
    this._csmGlint?.removeFromParent()
  }

  _updateCsmOrbit(dt) {
    const orbit = this._csmOrbit
    if (!orbit || !this.moon) return
    const csm = this._jettisonable['CSM']?.object
    if (!csm) return

    orbit.theta += CSM_ORBIT_RATE * dt
    orbit.time += dt

    const center = this.moon.group.position
    const radius = this.moon.sphere.geometry.parameters.radius * this.moon.group.scale.x
      + CSM_ORBIT_ALTITUDE
    const cos = Math.cos(orbit.theta)
    const sin = Math.sin(orbit.theta)
    const trackPos = new THREE.Vector3()
      .copy(center)
      .addScaledVector(CSM_ORBIT_U, radius * cos)
      .addScaledVector(CSM_ORBIT_V, radius * sin)
    // Prograde attitude: nose (apex, +Y home axis) along the direction of
    // travel around the Moon.
    const tangent = new THREE.Vector3()
      .addScaledVector(CSM_ORBIT_U, -sin)
      .addScaledVector(CSM_ORBIT_V, cos)
    const trackQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tangent,
    )

    const blend = easeInOutCubic(Math.min(orbit.time / CSM_ORBIT_BLEND_SECONDS, 1))
    if (blend < 1) {
      const freePos = orbit.startPos.clone().addScaledVector(orbit.vel, orbit.time)
      csm.position.lerpVectors(freePos, trackPos, blend)
      csm.quaternion.copy(orbit.startQuat).slerp(trackQuat, blend)
    } else {
      csm.position.copy(trackPos)
      csm.quaternion.copy(trackQuat)
    }

    // The glint is sized to read as a point from thousands of units away; while
    // Columbia is still backing off the LM's roof, right by the camera, it
    // would be a huge blown-out disc. It shows only once the CSM is on track.
    if (this._csmGlint) {
      this._csmGlint.position.copy(csm.position)
      this._csmGlint.visible = blend >= 1
    }
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
    // rendezvous), reclaim it from the debris list first — and end the
    // lunar parking orbit if that's where it was.
    if (id === 'CSM') this._endCsmOrbit()
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
    this._updateCsmOrbit(dt)
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
        (beat.spec.envEase ?? beat.spec.ease ?? easeInOutCubic)(t),
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
    } else {
      // Phases 0-2 with no beat/glide active: LaunchSequence is writing
      // rocket.position directly (pad hold, then the liftoff rise). Mirror
      // our own continuous state to match every frame, so whenever a beat
      // or glide DOES take over (the 2->3 handoff), _captureContinuous()
      // starts from where the rocket actually is instead of the stale
      // (0,0,0) this was constructed with — otherwise the rocket would snap
      // back down to the pad for a frame before climbing again.
      this._flightPos.copy(this.rocket.position)
      this._prevFlightPos.copy(this.rocket.position)
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
    this.rocket.rotation.set(
      0,
      this._flightYaw,
      -this._flightTilt + amp * 0.008 * Math.sin(t * 31.7),
    )

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
    this._endCsmOrbit()
    if (this._csmGlint) {
      this._csmGlint.material.map.dispose()
      this._csmGlint.material.dispose()
    }
    this.flash.dispose()
    Object.entries(this._exhausts).forEach(([id, exhaust]) => {
      if (id !== 'S-IC') exhaust.dispose() // S-IC's is owned by SceneManager
    })
    this._clearDebris()
  }
}
