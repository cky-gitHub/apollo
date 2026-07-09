import * as THREE from 'three'

// Kennedy Space Center Launch Complex 39A, July 1969 — evocation, not survey
// data. The real geography drives the layout: a raised concrete hardstand
// (the pad mound) with the flame trench cut through it north-south, the
// Mobile Launcher Platform up on pedestals over the trench, the Launch
// Umbilical Tower with its nine swing arms on the MLP beside the vehicle,
// scrub-flat Merritt Island all around, and the Atlantic to the east — +X
// here, which is also the direction the gravity turn flies, so the vehicle
// leaves over the water like the real one did.
//
// Contract with the rest of the scene (unchanged from the old blocky pad):
//  - the MLP deck top sits at y=0, the rocket's resting height — the vehicle
//    is never repositioned for the pad;
//  - everything lives under the one returned group; StagingChoreography
//    traverses it to set renderOrder=-1 and drive the altitude fade, so all
//    materials are created here and shared with nothing else.
const GRADE_Y = -22 // Merritt Island grade relative to the MLP deck
const HARDSTAND_TOP_Y = -10 // pad mound surface
const MLP = { width: 49, height: 7.8, depth: 41 } // deck top at y=0
const TRENCH = { width: 18, depth: 9, length: 150 } // cut below the mound top
const TOWER = { base: 12, height: 110, x: -20, levels: 9 } // LUT west of the vehicle

const MATERIALS = {
  scrub: new THREE.MeshStandardMaterial({ color: 0x565c48, roughness: 1, metalness: 0 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x9a8f76, roughness: 1, metalness: 0 }),
  ocean: new THREE.MeshStandardMaterial({ color: 0x2e4457, roughness: 0.35, metalness: 0.1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8f8d84, roughness: 0.95, metalness: 0.05 }),
  slab: new THREE.MeshStandardMaterial({ color: 0x9a988f, roughness: 0.9, metalness: 0.05 }),
  scorch: new THREE.MeshStandardMaterial({ color: 0x211f1c, roughness: 0.95, metalness: 0 }),
  trenchWall: new THREE.MeshStandardMaterial({ color: 0x55524a, roughness: 0.9, metalness: 0 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4d4f52, roughness: 0.6, metalness: 0.35 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x393a38, roughness: 0.55, metalness: 0.4 }),
  lattice: new THREE.MeshStandardMaterial({ color: 0x3f3e3b, roughness: 0.6, metalness: 0.35 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8d6cd, roughness: 0.7, metalness: 0.1 }),
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  return mesh
}

// Terrain: scrub flats, the beach line and the Atlantic east of the pad,
// and the crawlerway running off west toward the VAB.
function buildTerrain(group) {
  const scrub = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), MATERIALS.scrub)
  scrub.rotation.x = -Math.PI / 2
  scrub.position.y = GRADE_Y
  group.add(scrub)

  const beach = box(220, 0.4, 2600, MATERIALS.sand, 760, GRADE_Y + 0.1, 0)
  group.add(beach)

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2600), MATERIALS.ocean)
  ocean.rotation.x = -Math.PI / 2
  ocean.position.set(2050, GRADE_Y + 0.15, 0)
  group.add(ocean)

  // Crawlerway: two parallel gravel lanes with a median, heading west.
  for (const laneZ of [-4.5, 4.5]) {
    group.add(box(420, 0.3, 6.5, MATERIALS.sand, -300, GRADE_Y + 0.15, laneZ))
  }
}

// The pad mound: a sloped-sided hardstand rising from grade, its top split
// into two slabs flanking the flame trench, deflector down inside.
function buildHardstand(group) {
  const moundHeight = HARDSTAND_TOP_Y - GRADE_Y
  // Square frustum via a 4-segment cylinder rotated 45°; "radius" here is
  // the half-diagonal, so 130-wide top ≈ 92 corner radius.
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(96, 150, moundHeight, 4, 1),
    MATERIALS.concrete,
  )
  mound.rotation.y = Math.PI / 4
  mound.position.y = GRADE_Y + moundHeight / 2 - 0.6 // sink the seam under the slabs
  group.add(mound)

  // Top slabs flanking the trench (trench runs along Z).
  const slabWidth = (136 - TRENCH.width) / 2
  const slabX = TRENCH.width / 2 + slabWidth / 2
  for (const side of [-1, 1]) {
    group.add(box(slabWidth, 0.8, 136, MATERIALS.slab, side * slabX, HARDSTAND_TOP_Y - 0.4, 0))
  }

  // Flame trench: scorched floor, two walls, and the inverted-V deflector
  // ridge under the vehicle.
  const floorY = HARDSTAND_TOP_Y - TRENCH.depth
  group.add(box(TRENCH.width, 0.6, TRENCH.length, MATERIALS.scorch, 0, floorY, 0))
  for (const side of [-1, 1]) {
    group.add(
      box(1.4, TRENCH.depth, TRENCH.length, MATERIALS.trenchWall, side * (TRENCH.width / 2 + 0.7), floorY + TRENCH.depth / 2, 0),
    )
  }
  for (const side of [-1, 1]) {
    const plate = box(TRENCH.width - 2, 0.8, 13, MATERIALS.scorch, 0, 0, 0)
    plate.position.set(0, floorY + 3.4, side * 4.4)
    plate.rotation.x = side * -0.82 // the two faces meet in a ridge under the engines
    group.add(plate)
  }
}

// Mobile Launcher Platform: the two-story steel deck on its six pedestals,
// with the exhaust opening, hold-down hardware and tail service masts.
function buildMobileLauncher(group) {
  const deck = box(MLP.width, MLP.height, MLP.depth, MATERIALS.steel, 0, -MLP.height / 2, 0)
  group.add(deck)

  // Exhaust opening: a dark inset square under the engines.
  group.add(box(14, 0.3, 14, MATERIALS.scorch, 0, 0.02, 0))

  const pedestalTop = -MLP.height
  const pedestalHeight = pedestalTop - (HARDSTAND_TOP_Y - 0.0)
  for (const [px, pz] of [[-19, -15], [-19, 15], [19, -15], [19, 15], [-19, 0], [19, 0]]) {
    group.add(box(3.4, pedestalHeight, 3.4, MATERIALS.concrete, px, pedestalTop - pedestalHeight / 2, pz))
  }

  // Hold-down arms: four squat angled housings around the S-IC base.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const r = 8.2
    const arm = box(3.6, 3.2, 2.2, MATERIALS.darkSteel, Math.cos(angle) * r, 1.6, Math.sin(angle) * r)
    arm.rotation.y = -angle
    group.add(arm)
  }

  // Tail service masts: three slanted masts with umbilicals to the base.
  for (const [mx, mz] of [[-9, -9], [-9, 9], [-12, 0]]) {
    const mast = box(1.6, 9, 1.6, MATERIALS.steel, mx, 4.5, mz)
    mast.rotation.z = 0.12
    group.add(mast)
    group.add(box(3.2, 1.4, 1.6, MATERIALS.darkSteel, mx + 1.6, 8.2, mz))
  }
}

// Launch Umbilical Tower: square lattice shaft — four legs, ring beams and
// X-bracing at every level — topped by the hammerhead crane, with the nine
// swing arms reaching across to the stack (the top one carrying the white
// room). Simple boxes; from any mission camera it reads as structure.
function buildUmbilicalTower(group) {
  const tower = new THREE.Group()
  tower.name = 'umbilical-tower'
  tower.position.set(TOWER.x, 0, 0)
  group.add(tower)

  const half = TOWER.base / 2
  const levelHeight = TOWER.height / TOWER.levels

  const legGeometry = new THREE.BoxGeometry(1.1, TOWER.height, 1.1)
  for (const [lx, lz] of [[-half, -half], [-half, half], [half, -half], [half, half]]) {
    const leg = new THREE.Mesh(legGeometry, MATERIALS.lattice)
    leg.position.set(lx, TOWER.height / 2, lz)
    tower.add(leg)
  }

  const beamGeometry = new THREE.BoxGeometry(TOWER.base, 0.7, 0.7)
  const braceLength = Math.sqrt(2) * Math.hypot(TOWER.base, levelHeight) / 2
  const braceGeometry = new THREE.BoxGeometry(0.45, braceLength, 0.45)
  const braceAngle = Math.atan2(TOWER.base, levelHeight)
  for (let level = 0; level <= TOWER.levels; level += 1) {
    const y = level * levelHeight
    for (const side of [-1, 1]) {
      // Ring beams on all four faces…
      const beamX = new THREE.Mesh(beamGeometry, MATERIALS.lattice)
      beamX.position.set(0, y, side * half)
      tower.add(beamX)
      const beamZ = new THREE.Mesh(beamGeometry, MATERIALS.lattice)
      beamZ.rotation.y = Math.PI / 2
      beamZ.position.set(side * half, y, 0)
      tower.add(beamZ)

      // …and X-braces in each bay below this level.
      if (level === 0) continue
      const bayY = y - levelHeight / 2
      for (const lean of [-1, 1]) {
        const braceX = new THREE.Mesh(braceGeometry, MATERIALS.lattice)
        braceX.position.set(0, bayY, side * half)
        braceX.rotation.z = lean * braceAngle
        tower.add(braceX)
        const braceZ = new THREE.Mesh(braceGeometry, MATERIALS.lattice)
        braceZ.position.set(side * half, bayY, 0)
        braceZ.rotation.x = lean * braceAngle
        tower.add(braceZ)
      }
    }
  }

  // Hammerhead crane: the asymmetric jib slewing over the top.
  const craneY = TOWER.height + 3
  tower.add(box(2.6, 6, 2.6, MATERIALS.lattice, 0, TOWER.height + 3, 0))
  tower.add(box(26, 2.2, 2.4, MATERIALS.steel, 6, craneY + 2.4, 0))
  tower.add(box(3.4, 2.8, 3, MATERIALS.darkSteel, -6, craneY + 2.6, 0))

  // Swing arms at their service heights (S-IC up through the CM access arm,
  // which carries the white room at its tip). Tower face is at x+half; arms
  // reach toward the stack at x≈-5.5, so length ≈ gap minus a hinge margin.
  const armHeights = [14, 26, 38, 47, 56, 66, 76, 86, 96]
  const armLength = -TOWER.x - half - 6.2
  armHeights.forEach((y, i) => {
    const arm = box(armLength, 1.1, 2.1, MATERIALS.steel, half + armLength / 2, y, 0)
    tower.add(arm)
    if (i === armHeights.length - 1) {
      // White room at the CM hatch.
      tower.add(box(3, 2.6, 3, MATERIALS.white, half + armLength - 1.2, y + 1.7, 0))
    }
  })
}

// Pad-perimeter flavor: floodlight masts at the hardstand corners and the
// spherical LOX / LH2 storage tanks off past the mound.
function buildSurroundings(group) {
  for (const [fx, fz] of [[-58, -60], [-58, 60], [58, -60], [58, 60]]) {
    group.add(box(1.4, 32, 1.4, MATERIALS.lattice, fx, HARDSTAND_TOP_Y + 16, fz))
    group.add(box(4.2, 1.6, 1.8, MATERIALS.darkSteel, fx, HARDSTAND_TOP_Y + 32.4, fz))
  }

  const tankGeometry = new THREE.SphereGeometry(11, 24, 16)
  for (const [tx, tz] of [[-40, 180], [30, -190]]) {
    const tank = new THREE.Mesh(tankGeometry, MATERIALS.white)
    tank.position.set(tx, GRADE_Y + 9, tz)
    group.add(tank)
    group.add(box(26, 2.4, 8, MATERIALS.concrete, tx, GRADE_Y + 1.2, tz))
  }
}

export function buildLaunchPad() {
  const group = new THREE.Group()
  group.name = 'launch-pad'

  buildTerrain(group)
  buildHardstand(group)
  buildMobileLauncher(group)
  buildUmbilicalTower(group)
  buildSurroundings(group)

  return group
}
