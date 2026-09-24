import { EARTH_RADIUS } from './environment/Earth.js'
import { MOON_RADIUS } from './environment/Moon.js'

// One consistent spatial model for the whole mission, so every phase's
// Earth/Moon placement derives from the same real-scale geometry instead of
// hand-tuned per-phase numbers.
//
// The SIMULATION scale is real: kilometers, true body radii, true
// vehicle-to-body distances (the same telemetry anchors phases.js feeds the
// HUD). The RENDER scale is nonlinear: true distances are compressed through
// compressDistance() so far bodies stay inside the camera frustum, and each
// body is shrunk by exactly the factor that preserves its TRUE APPARENT
// ANGULAR SIZE at the compressed distance. The simulation stays consistent —
// only display distance bends. This is what makes "the Moon is a barely
// visible dot from the pad" and "Earth is a 2°-wide marble from Tranquility
// Base" both literally true on screen while both bodies remain renderable.
//
// Near a body the angular-size-preserving radius would blow up past what a
// frustum (or fp32) can hold, so it clamps at the body's groundRadius and the
// sphere becomes the terrain itself: Earth is a fixed 40k-unit sphere whose
// top surface carries the launch pad (lifting off reveals ground ->
// curvature -> globe with no swap), and the Moon sphere's top is the landing
// site. The clamp understates angular size close-in (a 40k sphere at pad
// range can't subtend 88°) — the accepted trade, documented here so nobody
// "fixes" a body's size by eye again.
//
// World axis convention (the second half of the model): the Moon always
// lives on the +X side of the sky, Earth on the -X side or below (it IS the
// ground for phases 0-6 and 13). Outbound coast reads Moon-ahead/Earth-behind
// along that one line; lunar ops put the Moon underfoot with Earth high in
// the -X sky; the return leg flies -X so Earth-ahead/Moon-behind reuses the
// same axis reversed. Per-phase direction vectors live with the SETTLED data
// in StagingChoreography — this module turns (direction, true distance) into
// render-space [x, y, z, scale, opacity] tuples for the env channel.

export const EARTH_RADIUS_KM = 6371
export const MOON_RADIUS_KM = 1737.4

// Render radius of a body's sphere when it is being stood on / launched
// from. Earth's is large so the pad's horizon and the ascent's slowly
// emerging curvature read at believable grazing angles; the Moon's smaller
// value keeps the long-standing landing-site tuning (SETTLED[9/10]) intact.
export const EARTH_GROUND_RADIUS = 40000
export const MOON_GROUND_RADIUS = 2550

// Nonlinear render compression for vehicle-to-body SURFACE distance, in
// world units (1 unit ~ 1 m near the vehicle). Identity out to LINEAR_RANGE,
// then logarithmic: the whole 384,400 km to the Moon lands at ~5,360 units —
// inside the frustum, outside the sky dome, with ~1,600 units of depth
// spread across the mission so "farther" still parallax-reads. C1-continuous
// at the knee (slope 1).
const LINEAR_RANGE = 2600
const LOG_SCALE = 190

export function compressDistance(meters) {
  if (meters <= LINEAR_RANGE) return meters
  return LINEAR_RANGE + LOG_SCALE * Math.log(1 + (meters - LINEAR_RANGE) / LOG_SCALE)
}

export const EARTH_BODY = {
  radiusKm: EARTH_RADIUS_KM,
  baseRadius: EARTH_RADIUS, // geometry radius at scale 1 (Earth.js)
  groundRadius: EARTH_GROUND_RADIUS,
}

export const MOON_BODY = {
  radiusKm: MOON_RADIUS_KM,
  baseRadius: MOON_RADIUS, // geometry radius at scale 1 (Moon.js)
  groundRadius: MOON_GROUND_RADIUS,
}

// Perceptual floor on apparent size (~0.7° angular radius). The honest 0.26°
// Moon-from-Earth disc is a sub-visible dark speck at render resolution;
// humans also perceive the real Moon far larger than its measured size (the
// moon illusion), so the classic sim cheat is to floor the apparent size at
// roughly double reality. Distance and direction stay honest.
const MIN_APPARENT_SIN = 0.012

// Env-channel tuple for a body seen from `vehiclePos` along unit-ish `dir`
// at a true surface distance of `surfaceDistKm`. Solves the rendered radius
// R' that preserves the true angular radius asin(R / (R + dist)) at the
// compressed gap, clamped to groundRadius as the body gets close enough to
// become terrain and to the perceptual floor when far.
export function bodyMark(body, vehiclePos, dir, surfaceDistKm, opacity = 1) {
  const [dx, dy, dz] = dir
  const len = Math.hypot(dx, dy, dz)
  const distM = surfaceDistKm * 1000
  const radiusM = body.radiusKm * 1000
  const gap = compressDistance(distM)
  // sin(true angular radius), preserved: R' / (gap + R') = R / (dist + R)
  const s = Math.max(radiusM / (distM + radiusM), MIN_APPARENT_SIN)
  const rendered = Math.min((gap * s) / (1 - s), body.groundRadius)
  const centerDist = gap + rendered
  return [
    vehiclePos[0] + (dx / len) * centerDist,
    vehiclePos[1] + (dy / len) * centerDist,
    vehiclePos[2] + (dz / len) * centerDist,
    rendered / body.baseRadius,
    opacity,
  ]
}

// A body as standing terrain: full ground-radius sphere whose top surface
// sits at `topY` directly under (siteX, siteZ). Phases 0-6 park Earth this
// way beneath the pad; phase 13 parks it beneath the splash site so arrival
// mirrors departure.
export function groundMark(body, siteX, siteZ, topY, opacity = 1) {
  return [siteX, topY - body.groundRadius, siteZ, body.groundRadius / body.baseRadius, opacity]
}

// Blends two env tuples for the same body AROUND the vehicle instead of in a
// straight line through space. Each end is re-expressed relative to its own
// phase's vehicle position as (direction, surface gap, rendered radius); the
// direction slerps, the gap lerps, the radius lerps in log space (so
// apparent size changes evenly), and the result is placed from the anchor
// blended the same way. A body therefore swings round and grows or shrinks -
// it never cuts across the scene or through the vehicle, which straight-line
// blending did whenever two phases put it on different sides. Identical ends
// (Earth as fixed ground through the ascent) are returned untouched, so a
// body that should stay put in the world does.
export function lerpBodyMark(body, a, anchorA, b, anchorB, t) {
  if (a.every((value, i) => value === b[i])) return a.slice()
  const rel = (tuple, anchor) => {
    const dx = tuple[0] - anchor[0]
    const dy = tuple[1] - anchor[1]
    const dz = tuple[2] - anchor[2]
    const dist = Math.hypot(dx, dy, dz) || 1
    const radius = tuple[3] * body.baseRadius
    return { dir: [dx / dist, dy / dist, dz / dist], gap: dist - radius, radius }
  }
  const A = rel(a, anchorA)
  const B = rel(b, anchorB)

  // Slerp of unit vectors; falls back to a normalized lerp near-parallel.
  const cos = Math.min(1, Math.max(-1, A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1] + A.dir[2] * B.dir[2]))
  const angle = Math.acos(cos)
  let dir
  if (angle < 1e-4) dir = A.dir
  else {
    const sin = Math.sin(angle)
    const wa = Math.sin((1 - t) * angle) / sin
    const wb = Math.sin(t * angle) / sin
    dir = [0, 1, 2].map((i) => A.dir[i] * wa + B.dir[i] * wb)
  }

  const radius = Math.exp(Math.log(A.radius) * (1 - t) + Math.log(B.radius) * t)
  const gap = A.gap + (B.gap - A.gap) * t
  const anchor = [0, 1, 2].map((i) => anchorA[i] + (anchorB[i] - anchorA[i]) * t)
  const centerDist = gap + radius
  return [
    anchor[0] + dir[0] * centerDist,
    anchor[1] + dir[1] * centerDist,
    anchor[2] + dir[2] * centerDist,
    radius / body.baseRadius,
    a[4] + (b[4] - a[4]) * t,
  ]
}
