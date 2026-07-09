import * as THREE from 'three'

// Per-phase camera framing. Phase -> pose mapping, lerped between phases on
// transition (never hardcode camera moves inline in animation loops — always
// go through this mapping).
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
// Optional per-pose modifiers (all data, applied by SceneManager):
//  - duration: ms for the transition INTO this pose (default below)
//  - shake: camera shake amplitude in meters while this phase is active,
//    multiplied by the choreography-driven shake gain (engines on/off)
//  - orbitSpeed: rad/s slow auto-drift of the offset around the focus point,
//    so long "hold" beats keep drifting cinematically instead of freezing.
//    Additive with the user's free-look orbit (see freeLook.js) — both feed
//    resolvePoseWorld's `orbit` param below.
export const CAMERA_PHASES = [
  { position: [60, 64, 270], target: [0, 62, 0] }, // 0: pad, countdown
  { position: [30, 25, 70], target: [0, 20, 0], shake: 0.35 }, // 1: ignition
  { position: [70, 90, 150], target: [0, 55, 0], shake: 0.55, duration: 1600 }, // 2: liftoff, tower clear
  // 3: Max-Q / S-IC ascent — low hero chase, slightly under the stack
  { frame: 'rocket', focusHeight: 55, position: [85, -12, 175], target: [0, 6, 0], shake: 0.85, duration: 2800, orbitSpeed: 0.012 },
  // 4: S-IC sep / S-II ignition — wide side shot, aimed a touch below the
  // focus so the spent stage tumbles down through frame
  { frame: 'rocket', focusHeight: 58, position: [115, -12, 150], target: [0, -8, 0], shake: 0.3, duration: 3200, orbitSpeed: 0.02 },
  // 5: S-II ascent — closer 3/4 on the remaining stack, aimed so the nose
  // and the escape-tower jettison path stay in frame, slow orbit
  { frame: 'rocket', focusHeight: 76, position: [55, 14, 95], target: [0, 8, 0], shake: 0.3, duration: 3000, orbitSpeed: 0.035 },
  // 6: S-IVB burn / TLI — tight low-behind shot, plume in the foreground
  { frame: 'rocket', focusHeight: 88, position: [32, -34, 58], target: [0, -4, 0], shake: 0.3, duration: 3000, orbitSpeed: 0.045 },
  // 7: transposition & docking — medium shot on the stack's top (the CSM's
  // flip-and-return all happens around local y≈96-116), Earth looming behind
  { frame: 'rocket', focusHeight: 100, position: [30, 4, 54], target: [0, 2, 0], duration: 3200, orbitSpeed: 0.028 },
  // 8: lunar approach — behind and above the docked stack, looking forward
  // and down the flight path so the Moon grows ahead of the vehicle
  { frame: 'rocket', focusHeight: 98, position: [-55, 30, 62], target: [0, -10, 0], duration: 3000, orbitSpeed: 0.012 },
  // 9: powered descent / touchdown — close orbit on the LM, slightly high
  // so the surface rising to meet it stays in frame
  { frame: 'rocket', focusHeight: 93, position: [20, 8, 34], target: [0, -3, 0], duration: 3400, orbitSpeed: 0.05 },
  // 10: Tranquility Base — low tableau, but kept a few meters ABOVE the
  // sphere's grazing curvature (the surface top sits ~focus+81; a camera at
  // focus-1 ends up underground and the Moon front-face culls away)
  { frame: 'rocket', focusHeight: 90, position: [21, 7, 34], target: [0, 0, 0], duration: 3800, orbitSpeed: 0.045 },
  // 11: lunar liftoff & rendezvous — under the ascent stage looking up, so
  // the climb reads and Columbia's approach comes down through frame
  { frame: 'rocket', focusHeight: 90, position: [26, -8, 52], target: [0, 7, 0], duration: 3200, orbitSpeed: 0.02 },
  // 12: trans-Earth injection — trailing the CSM, aimed past it toward the
  // Earth growing ahead (env keeps Earth at -X)
  { frame: 'rocket', focusHeight: 99, position: [44, 12, 52], target: [0, -2, 0], duration: 3000, orbitSpeed: 0.015 },
  // 13: reentry & splashdown — on the capsule with pose shake armed (the
  // choreography's vibe gain turns it into plasma buffeting), aimed a touch
  // high so the deployed mains stay inside the frame at the end
  { frame: 'rocket', focusHeight: 97, position: [27, 3, 50], target: [0, 9, 0], shake: 0.5, duration: 3400, orbitSpeed: 0.03 },
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
// combined auto-drift (orbitSpeed) + user free-look angle, applied about the
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
