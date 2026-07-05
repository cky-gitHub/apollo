import * as THREE from 'three'

// Placeholder per-phase camera framing (rough — refined later once the
// mission timeline is finalized). Phase -> {position, target} in world units,
// consistent with the GLB rocket built in rocket/RocketAssembly.js. Only
// phase 0 has been reframed for the current stack; the rest are still rough
// and will need a pass of their own once liftoff/staging camera work happens.
export const CAMERA_PHASES = [
  { position: [60, 64, 270], target: [0, 62, 0] }, // 0: pad, countdown
  { position: [30, 25, 70], target: [0, 20, 0] }, // 1: ignition
  { position: [70, 90, 150], target: [0, 55, 0] }, // 2: liftoff, tower clear
  { position: [130, 160, 220], target: [0, 90, 0] }, // 3: max-Q, S-IC ascent
  { position: [0, 190, 240], target: [0, 100, 0] }, // 4: S-IC sep, S-II ignition
  { position: [90, 140, 170], target: [0, 90, 0] }, // 5: S-II ascent
  { position: [40, 60, 50], target: [0, 55, 0] }, // 6: S-IVB burn / TLI
  { position: [20, 10, 30], target: [0, 8, 0] }, // 7: CSM/LM transposition & docking
  { position: [15, 8, 20], target: [0, 5, 0] }, // 8: LM descent
  { position: [0, 5, 25], target: [0, 2, 0] }, // 9: lunar surface
]

export function getCameraPose(phase) {
  const index = THREE.MathUtils.clamp(
    Math.round(phase),
    0,
    CAMERA_PHASES.length - 1,
  )
  return CAMERA_PHASES[index]
}

export function interpolatePose(fromPose, toPose, t) {
  const position = new THREE.Vector3(...fromPose.position).lerp(
    new THREE.Vector3(...toPose.position),
    t,
  )
  const target = new THREE.Vector3(...fromPose.target).lerp(
    new THREE.Vector3(...toPose.target),
    t,
  )
  return { position, target }
}
