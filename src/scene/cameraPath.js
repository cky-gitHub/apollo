import * as THREE from 'three'

// Per-phase camera framing. Phase -> pose mapping; a phase change BLENDS
// smoothly into the new pose (eased over `duration`, see SceneManager.
// setPhase) — the blend starts from wherever the camera actually is,
// including any free-look offset the user dragged in, so it never snaps
// before gliding. Never hardcode camera moves inline in animation loops —
// always go through this mapping.
//
// Two frames of reference:
//  - world (default): position/target are absolute world coordinates. Used
//    for the pad phases (0-2) where the shot is anchored to the ground.
//  - frame: 'rocket': position/target are offsets from a "focus point" on
//    the vehicle — the rocket group's local (0, focusHeight, 0) carried into
//    world space every frame. The camera therefore tracks the rocket through
//    powered flight while the framing stays a pure data pair. focusHeight
//    moves up the stack as lower stages are shed so the shot stays centered
//    on what's left.
//
// A single fixed distance across every phase was tried and doesn't work:
// the full 110m stack (phase 3, originally ~195 units out) and the lone 7m
// LM (phase 9/10, originally ~40 units out) need very different framing
// distances — forcing one distance makes one or the other unreadable
// (verified: the Moon/LM phases go blank). So each phase keeps its own
// tuned distance/angle; what's smooth is the BLEND between them (no cuts).
//
// Optional per-pose modifiers (all data, applied by SceneManager):
//  - duration: ms for the glide INTO this pose — used for every phase
//    change (setPhase) and for the return glide out of inspect mode
//  - shake: camera shake amplitude in meters while this phase is active,
//    multiplied by the choreography-driven shake gain (engines on/off)
// The flight camera's fixed offset from the focus point: the liftoff shot's
// viewing direction, (0.41, 0.2, 0.89), at a single distance of 60 units —
// close enough that the 7 m lander still reads, far enough that the current
// stage of the full stack is framed.
export const FLIGHT_CAMERA_OFFSET = [24.6, 12, 53.4]

export const CAMERA_PHASES = [
  { position: [60, 64, 270], target: [0, 62, 0] }, // 0: pad, countdown
  { position: [30, 25, 70], target: [0, 20, 0], shake: 0.35 }, // 1: ignition
  { position: [70, 90, 150], target: [0, 55, 0], shake: 0.55, duration: 1600 }, // 2: liftoff, tower clear
  // 3-13: ONE camera for the whole flight. Same direction, same distance,
  // every phase — the only thing that changes is focusHeight, which walks up
  // the stack to whatever stage is current, so the camera slides along with
  // it. There used to be a separately tuned pose per phase, and the glide
  // between two of them cut a straight line past the vehicle: every phase
  // change zoomed in, back out, and swung the view round. With one pose there
  // is nothing to glide between. Earth and the Moon are placed in front of
  // this camera (StagingChoreography's EARTH_LINE / MOON_LINE), not the
  // other way round.
  //
  // The direction continues the liftoff shot's (phase 2), so leaving the pad
  // is the one and only change of view.
  ...[
    { focusHeight: 55, shake: 0.85, duration: 2800 }, // 3: Max-Q / S-IC ascent
    { focusHeight: 58, shake: 0.3, duration: 3200 }, // 4: S-IC sep / S-II ignition
    { focusHeight: 76, shake: 0.3, duration: 3000 }, // 5: S-II ascent, tower jettison
    { focusHeight: 88, shake: 0.3, duration: 3000 }, // 6: S-IVB burn / TLI
    { focusHeight: 100, duration: 3200 }, // 7: transposition & docking
    { focusHeight: 98, duration: 3000 }, // 8: lunar approach
    { focusHeight: 93, duration: 3400 }, // 9: powered descent / touchdown
    // 10: Tranquility Base — the offset's height keeps the camera above the
    // sphere's grazing curvature (a camera at focus-1 ends up underground and
    // the Moon front-face culls away)
    { focusHeight: 90, duration: 3800 },
    { focusHeight: 90, duration: 3200 }, // 11: lunar liftoff & rendezvous
    { focusHeight: 99, duration: 3000 }, // 12: trans-Earth injection
    { focusHeight: 97, shake: 0.5, duration: 3400 }, // 13: reentry & splashdown
  ].map((pose) => ({ frame: 'rocket', position: FLIGHT_CAMERA_OFFSET, target: [0, 0, 0], ...pose })),
]

export const DEFAULT_TRANSITION_DURATION = 1200

export function getCameraPose(phase) {
  const index = THREE.MathUtils.clamp(
    Math.round(phase),
    0,
    CAMERA_PHASES.length - 1,
  )
  return CAMERA_PHASES[index]
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const _focus = new THREE.Vector3()
const _offset = new THREE.Vector3()
const _spherical = new THREE.Spherical()
const POLE_EPSILON = 0.05 // rad of slack kept from the poles so orbiting straight up/down never flips the camera

// Rotates `offset` (a vector from some fixed focus point) by azimuth (around
// +Y) and polar (tilt toward/away from +Y) deltas, in place. Exported so
// SceneManager can apply the same free-look math to inspect mode's
// OrbitControls-driven camera (which this module's pose pipeline doesn't
// touch — see FreeLookControl's inspect-mode branch).
export function orbitOffset(offset, azimuth, polar) {
  if (!azimuth && !polar) return offset
  _spherical.setFromVector3(offset)
  _spherical.theta += azimuth
  _spherical.phi = THREE.MathUtils.clamp(_spherical.phi + polar, POLE_EPSILON, Math.PI - POLE_EPSILON)
  return offset.setFromSpherical(_spherical)
}

// Resolves a pose (world or rocket-relative) to world-space vectors, writing
// into outPosition/outTarget. `orbit` is { azimuth, polar } in radians — the
// user's free-look angle, applied about the
// focus point (rocket poses) or the fixed target (world/pad poses), so a
// look-around is available on every phase. Only the CAMERA offset orbits;
// the target offset only gets azimuth (and for rocket poses that offset is
// always near-vertical, i.e. parallel to the axis, so it's a no-op) — this
// keeps the look-at point pinned near the focus regardless of how far the
// user tilts, instead of swinging off toward a degenerate near-pole azimuth.
export function resolvePoseWorld(pose, rocket, orbit, outPosition, outTarget) {
  const azimuth = orbit?.azimuth ?? 0
  const polar = orbit?.polar ?? 0
  outPosition.set(...pose.position)
  outTarget.set(...pose.target)

  if (pose.frame === 'rocket' && rocket) {
    _focus
      .set(0, pose.focusHeight ?? 0, 0)
      .applyQuaternion(rocket.quaternion)
      .add(rocket.position)
    orbitOffset(outPosition, azimuth, polar)
    outTarget.applyAxisAngle(Y_AXIS, azimuth)
    outPosition.add(_focus)
    outTarget.add(_focus)
  } else if (azimuth || polar) {
    _offset.copy(outPosition).sub(outTarget)
    orbitOffset(_offset, azimuth, polar)
    outPosition.copy(outTarget).add(_offset)
  }
}
