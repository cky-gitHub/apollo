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
//  - orbitSpeed: rad/s slow orbit of the offset around the focus point, so
//    long "hold" beats keep drifting cinematically instead of freezing
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
  // 7-9: placeholder drift shots on the S-IVB/CSM until lunar assets exist
  { frame: 'rocket', focusHeight: 88, position: [72, 12, 115], target: [0, 0, 0], duration: 2800, orbitSpeed: 0.02 },
  { frame: 'rocket', focusHeight: 88, position: [95, -8, 140], target: [0, 0, 0], duration: 2800, orbitSpeed: 0.015 },
  { frame: 'rocket', focusHeight: 88, position: [120, 25, 160], target: [0, 0, 0], duration: 2800, orbitSpeed: 0.012 },
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

// Resolves a pose (world or rocket-relative) to world-space vectors, writing
// into outPosition/outTarget. orbitAngle rotates rocket-relative offsets
// around +Y about the focus point; world poses ignore it.
export function resolvePoseWorld(pose, rocket, orbitAngle, outPosition, outTarget) {
  outPosition.set(...pose.position)
  outTarget.set(...pose.target)

  if (pose.frame === 'rocket' && rocket) {
    _focus
      .set(0, pose.focusHeight ?? 0, 0)
      .applyQuaternion(rocket.quaternion)
      .add(rocket.position)
    outPosition.applyAxisAngle(Y_AXIS, orbitAngle).add(_focus)
    outTarget.applyAxisAngle(Y_AXIS, orbitAngle).add(_focus)
  }
}
