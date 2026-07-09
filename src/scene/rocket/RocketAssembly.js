import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STAGE_SPECS } from '../../data/stageSpecs.js'

const SATURN_V_MODEL_URL = '/models/Saturn%20V.glb'
const SATURN_V_TOP_MODEL_URL = '/models/very%20top.glb'
const LM_MODEL_URL = '/models/lunar%20module.glb'
const FEET_TO_METERS = 0.3048
const TOP_ADAPTER_HEIGHT = 4.9
const TOP_BODY_BOTTOM_NAME = 'SM Body, Bottom'
// The LM GLB is authored legs-down (+Y up, base near y=0) at ~5m tall/6.4m
// wide — scaled down slightly so the stowed module tucks inside the SLA
// adapter cone below the CSM.
const LM_SCALE = 0.9
const LM_STOWED_CLEARANCE = 0.3 // above the adapter's bottom lip
// The LM GLB is a flat list of ~134 baked-transform meshes with no
// stage-level grouping. A horizontal cut in model space partitions them:
// descent stage (octagonal box, legs, porch/ladder) sits below y=2.5,
// ascent stage (crew cabin, APS, antennas) above — verified against the
// node bounds. The lunar-liftoff beat jettisons 'LM-Descent' as a unit.
const LM_STAGE_CUT_Y = 2.5

// The imported GLB is authored as a few major Saturn V assemblies rather than
// already-separated mission stages. Interstages/adapters travel with the lower
// stage, matching the physical separation behavior of the real vehicle.
const MODEL_STAGE_PARTS = [
  { id: 'S-IC', parts: ['S-IC', 'Interstage'] },
  { id: 'S-II', parts: ['S-II', 'S-II_Top'] },
  { id: 'S-IVB', parts: ['S-IVB', 'Instrument_Unit'] },
]

const TOP_REFERENCE_PREFIXES = ['Markings-']

function loadGltf(url) {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

function createStageGroup(stageData) {
  const group = new THREE.Group()
  group.name = stageData.id
  group.userData.stageId = stageData.id
  group.userData.label = stageData.label
  return group
}

function normalName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findObjectByLooseName(root, name) {
  const target = normalName(name)
  let match = null
  root.traverse((object) => {
    if (!match && normalName(object.name).includes(target)) match = object
  })
  return match
}

function pruneTopReferenceObjects(root) {
  const removals = []
  root.traverse((object) => {
    if (object === root) return
    if (TOP_REFERENCE_PREFIXES.some((prefix) => object.name.startsWith(prefix))) {
      removals.push(object)
    }
  })
  removals.forEach((object) => object.parent?.remove(object))
}

function tuneTopMaterial(material) {
  if (!material || material.userData?.saturnVTuned) return

  const name = material.name.toLowerCase()
  if (
    name === 'root' ||
    name === 'white' ||
    name.startsWith('fiberglass')
  ) {
    material.color.set(0xdeddd6)
    material.metalness = 0.05
    material.roughness = 0.72
  } else if (name.includes('steel') || name.includes('sheet_metal')) {
    material.color.set(0xbfc0bb)
    material.metalness = 0.25
    material.roughness = 0.5
  } else if (name.includes('mylar')) {
    material.color.set(0xc9c6bc)
    material.metalness = 0.35
    material.roughness = 0.42
  } else if (name.includes('ablative')) {
    material.color.set(0x4b3a2f)
    material.roughness = 0.78
  } else if (name.includes('black')) {
    material.color.set(0x242426)
    material.roughness = 0.62
  }

  material.userData.saturnVTuned = true
}

// The top GLB stores the launch-escape tower + boost protective cover as
// dozens of sibling nodes prefixed "LES-". Gather them into one named group
// so the staging choreography can jettison the whole tower as a unit.
function groupLesAssembly(topRoot) {
  const lesNodes = []
  topRoot.traverse((object) => {
    if (object.name.startsWith('LES-') && !object.parent?.name?.startsWith('LES-')) {
      lesNodes.push(object)
    }
  })
  if (lesNodes.length === 0) return

  const les = new THREE.Group()
  les.name = 'LES'
  topRoot.add(les)
  lesNodes.forEach((node) => les.attach(node))
}

// Splits the CSM into 'CM' and 'SM' groups so reentry can jettison the
// Service Module and fly the Command Module home alone. Most part nodes
// carry a CM/SM name prefix; the rest (Aft Frames, EPS radiators, hatches,
// umbilical…) are classified geometrically against the aft heat shield's
// bottom — everything above the CM's blunt end is CM. Runs on the raw
// unscaled model, before the FEET_TO_METERS scale and stack positioning.
function splitCommandServiceModules(topRoot) {
  // The part nodes are siblings under one dense hub node ("Root" in the
  // Sketchfab export) — find it structurally rather than by name.
  let hub = topRoot
  topRoot.traverse((object) => {
    if (object.children.length > hub.children.length) hub = object
  })

  topRoot.updateWorldMatrix(true, true)
  const shield = findObjectByLooseName(topRoot, 'Ht Shld-Aft Abl')
  const cutY = shield
    ? new THREE.Box3().setFromObject(shield).min.y + 0.05
    : 0

  const cm = new THREE.Group()
  cm.name = 'CM'
  const sm = new THREE.Group()
  sm.name = 'SM'

  const box = new THREE.Box3()
  ;[...hub.children].forEach((child) => {
    if (child.name === 'LES' || child.name.startsWith('LES-')) return
    let bucket
    if (/^CM[\s-]/.test(child.name)) bucket = cm
    else if (/^SM[\s-]/.test(child.name)) bucket = sm
    else {
      box.setFromObject(child)
      bucket = (box.min.y + box.max.y) / 2 >= cutY ? cm : sm
    }
    bucket.add(child) // identity groups in the same frame — transforms hold
  })
  hub.add(cm, sm)
}

function tuneTopMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(tuneTopMaterial)
  })
}

function boxRadius(box) {
  const size = box.getSize(new THREE.Vector3())
  return Math.max(size.x, size.z) / 2
}

function radiusForNamedObject(root, objectName, fallbackRadius) {
  const object = findObjectByLooseName(root, objectName)
  if (!object) return fallbackRadius
  return boxRadius(new THREE.Box3().setFromObject(object))
}

// Plain fuselage-white shell, shared by the SLA pieces and the interstage
// fillers below — a tapered (or straight, if radii match) tube the height of
// the gap it's plugging.
function createShellMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xdeddd6,
    metalness: 0.05,
    roughness: 0.72,
    side: THREE.DoubleSide,
  })
}

function createTaperedShell(topRadius, bottomRadius, height) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, height, 64, 1, true),
    createShellMaterial(),
  )
}

// Spacecraft-LM Adapter. Two parts, mirroring the real hardware:
//  - 'SLA-Ring': the fixed aft section, bolted to the Instrument Unit. The
//    caller attaches it to the S-IVB stage group so it departs WITH the
//    S-IVB after the LM is extracted, exactly like the real adapter's aft
//    panels did.
//  - 'CSM-SLA-Adapter': the four forward petal panels. On Apollo 11 these
//    were fully JETTISONED at transposition — pyros severed the longitudinal
//    joints, the panels hinged outward on their base lines, and spring
//    thrusters flung them clear, tumbling. Each petal mesh therefore lives
//    inside an 'SLA-Panel-i' hinge group whose origin sits ON its hinge line
//    (the panel's base-edge midpoint), so the choreography can drive the
//    open-and-release purely by rotating/attaching the hinge group.
//    userData on each hinge: hingeAxis (unit tangent — rotating about +axis
//    tips the panel top outward) and outward (unit radial), in stack-local
//    space. userData.panelHeight on the group anchors the pyro flash.
const SLA_RING_FRACTION = 0.28 // aft fixed section, as fraction of SLA height
const SLA_PANEL_GAP = 0.012 // rad seam between adjacent petals — the pyro joint lines

function createSlaAssembly(bottomRadius, topRadius) {
  const ringHeight = TOP_ADAPTER_HEIGHT * SLA_RING_FRACTION
  const panelHeight = TOP_ADAPTER_HEIGHT - ringHeight
  const ringTopRadius = THREE.MathUtils.lerp(bottomRadius, topRadius, SLA_RING_FRACTION)

  const ring = createTaperedShell(ringTopRadius, bottomRadius, ringHeight)
  ring.name = 'SLA-Ring'

  const panels = new THREE.Group()
  panels.name = 'CSM-SLA-Adapter'
  panels.userData.stageId = 'CSM'
  panels.userData.panelHeight = panelHeight

  const thetaLength = Math.PI / 2 - 2 * SLA_PANEL_GAP
  for (let i = 0; i < 4; i += 1) {
    const thetaCenter = i * (Math.PI / 2) + Math.PI / 4
    // CylinderGeometry convention: x = r·sin(θ), z = r·cos(θ).
    const outward = new THREE.Vector3(Math.sin(thetaCenter), 0, Math.cos(thetaCenter))
    const hingeAxis = new THREE.Vector3(Math.cos(thetaCenter), 0, -Math.sin(thetaCenter))

    const geometry = new THREE.CylinderGeometry(
      topRadius,
      ringTopRadius,
      panelHeight,
      24,
      1,
      true,
      thetaCenter - Math.PI / 4 + SLA_PANEL_GAP,
      thetaLength,
    )
    geometry.translate(0, panelHeight / 2, 0) // base at y=0, the hinge plane

    const hinge = new THREE.Group()
    hinge.name = `SLA-Panel-${i}`
    hinge.position.copy(outward).multiplyScalar(ringTopRadius)
    hinge.userData.hingeAxis = hingeAxis
    hinge.userData.outward = outward

    const mesh = new THREE.Mesh(geometry, createShellMaterial())
    mesh.position.copy(outward).multiplyScalar(-ringTopRadius) // cone axis back to stack center
    hinge.add(mesh)
    panels.add(hinge)
  }

  return { ring, panels, ringHeight }
}

// The source GLB's S-IC/S-II and S-II/S-IVB interstages are open/lattice-
// like where they meet the next stage up — accurate-looking close in, but
// from a normal viewing distance the opening reads as a gap with the tank
// dome behind it visible through it, even though the two stages' bounding
// boxes actually overlap. A plain shell spanning that measured overlap
// hides the opening; it's added to (and travels with) the LOWER stage, same
// as the real interstage would after separation.
function addInterstageFiller(lowerGroup, upperGroup) {
  const lowerTop = lowerGroup.userData.modelBounds.max[1]
  const upperBottom = upperGroup.userData.modelBounds.min[1]
  const height = lowerTop - upperBottom
  if (height <= 0) return // bounds don't actually overlap -- nothing to bridge

  const lowerRadius = STAGE_SPECS[lowerGroup.userData.stageId].diameter / 2
  const upperRadius = STAGE_SPECS[upperGroup.userData.stageId].diameter / 2
  const filler = createTaperedShell(upperRadius, lowerRadius, height)
  filler.name = `${lowerGroup.name}-${upperGroup.name}-Filler`
  filler.position.y = (lowerTop + upperBottom) / 2 - lowerGroup.position.y
  lowerGroup.add(filler)
}

function centerStageGroup(group) {
  group.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(group)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  group.children.forEach((child) => {
    child.position.y -= center.y
  })

  group.position.y = center.y
  group.userData.bodyLength = size.y
  group.userData.modelBounds = { min: box.min.toArray(), max: box.max.toArray() }
}

// Bounding box of `root` skipping the subtree named `excludeName` — used to
// measure the CSM body proper while the (later-jettisoned) LES tower and its
// boost cover are still attached.
function boxExcluding(root, excludeName) {
  const box = new THREE.Box3()
  root.updateWorldMatrix(true, true)
  root.traverse((object) => {
    if (!object.isMesh) return
    let current = object
    while (current && current !== root) {
      if (current.name === excludeName) return
      current = current.parent
    }
    box.expandByObject(object)
  })
  return box
}

function addTopAssembly({ rocket, stageGroups, topGltf }) {
  if (!topGltf) return

  const topRoot = topGltf.scene
  topRoot.name = 'CSM-LES'
  pruneTopReferenceObjects(topRoot)
  groupLesAssembly(topRoot)
  splitCommandServiceModules(topRoot)
  tuneTopMaterials(topRoot)
  topRoot.scale.setScalar(FEET_TO_METERS)
  topRoot.updateWorldMatrix(true, true)

  const lowerTopY = new THREE.Box3().setFromObject(rocket).max.y
  const bodyBottomObject = findObjectByLooseName(topRoot, TOP_BODY_BOTTOM_NAME)
  if (!bodyBottomObject) {
    console.warn(`Saturn V top model is missing ${TOP_BODY_BOTTOM_NAME}; skipping top assembly.`)
    return
  }

  const bodyBottomBox = new THREE.Box3().setFromObject(bodyBottomObject)
  const bodyBottomY = bodyBottomBox.min.y
  const adapterTopY = lowerTopY + TOP_ADAPTER_HEIGHT
  const topRadius = boxRadius(bodyBottomBox)
  const bottomRadius = radiusForNamedObject(rocket, 'Instrument_Unit', topRadius)

  const topStage = createStageGroup(STAGE_SPECS.CSM)
  const { ring, panels, ringHeight } = createSlaAssembly(bottomRadius, topRadius)

  // The fixed aft ring rides the S-IVB stage group (positioned in its local
  // frame), so it leaves with the S-IVB after LM extraction; the petals ride
  // the CSM stage group until the transposition beat blows them off.
  const sivbGroup = stageGroups.get('S-IVB')
  if (sivbGroup) {
    ring.position.y = lowerTopY + ringHeight / 2 - sivbGroup.position.y
    sivbGroup.add(ring)
  } else {
    ring.position.y = lowerTopY + ringHeight / 2
    topStage.add(ring)
  }
  panels.position.y = lowerTopY + ringHeight

  topRoot.position.y = adapterTopY - bodyBottomY
  topStage.add(panels)
  topStage.add(topRoot)

  // Pivot group for the transposition maneuver: 'CSM-Body' wraps the CSM
  // (and its LES, until jettison) with its ORIGIN at the body's center, so
  // the 180° transposition flip is a plain rotation of this group. The SLA
  // adapter stays outside it — it jettisons separately.
  topStage.updateWorldMatrix(true, true)
  const bodyBox = boxExcluding(topRoot, 'LES')
  const csmBody = new THREE.Group()
  csmBody.name = 'CSM-Body'
  csmBody.position.y = (bodyBox.min.y + bodyBox.max.y) / 2
  topStage.add(csmBody)
  csmBody.attach(topRoot)
  // Rotation-invariant offsets from the pivot, for the docking math and the
  // SPS exhaust anchor (the bell is the body's lowest point).
  csmBody.userData.apexOffset = bodyBox.max.y - csmBody.position.y
  csmBody.userData.engineOffsetY = bodyBox.min.y - csmBody.position.y + 0.4

  centerStageGroup(topStage)
  rocket.add(topStage)
  stageGroups.set('CSM', topStage)
}

// Partitions the LM's flat mesh list into 'LM-Descent' / 'LM-Ascent' groups
// by each mesh's bounds center against LM_STAGE_CUT_Y (model space, before
// the LM_SCALE is applied). engineOffsetY on the ascent group anchors the
// APS exhaust for the lunar-liftoff beat, in the same lmRoot-local units.
function splitLunarModuleStages(lmRoot) {
  // The mesh list sits under a single wrapper node ("lunarlande"), not
  // directly under the scene — find the dense hub and partition ITS children.
  let hub = lmRoot
  lmRoot.traverse((object) => {
    if (object.children.length > hub.children.length) hub = object
  })

  lmRoot.updateWorldMatrix(true, true)
  const ascent = new THREE.Group()
  ascent.name = 'LM-Ascent'
  const descent = new THREE.Group()
  descent.name = 'LM-Descent'

  const box = new THREE.Box3()
  ;[...hub.children].forEach((child) => {
    box.setFromObject(child)
    const centerY = (box.min.y + box.max.y) / 2
    ;(centerY >= LM_STAGE_CUT_Y ? ascent : descent).add(child)
  })
  hub.add(descent, ascent)

  box.setFromObject(ascent)
  ascent.userData.engineOffsetY = box.min.y + 0.1
}

// Adds the Lunar Module stowed inside the SLA adapter, invisible until the
// transposition-and-docking beat reveals it. Registered as a stage group
// (before CSM, matching stack order) so inspection explode/isolate includes
// it.
function addLunarModule({ rocket, stageGroups, lmGltf }) {
  if (!lmGltf) return

  const adapter = rocket.getObjectByName('CSM-SLA-Adapter')
  if (!adapter) return

  const lmRoot = lmGltf.scene
  lmRoot.name = 'LM-Model'
  splitLunarModuleStages(lmRoot)
  lmRoot.scale.setScalar(LM_SCALE)
  lmRoot.updateWorldMatrix(true, true)

  const lmGroup = createStageGroup(STAGE_SPECS.LM)
  lmGroup.add(lmRoot)

  rocket.updateWorldMatrix(true, true)
  // The LM rests just above the SLA's AFT end — the fixed ring, which now
  // lives on the S-IVB stage group — not the (higher) petal-panel base.
  const slaBottomRef = rocket.getObjectByName('SLA-Ring') ?? adapter
  const adapterBottomY = new THREE.Box3().setFromObject(slaBottomRef).min.y
  const lmBox = new THREE.Box3().setFromObject(lmRoot)
  lmRoot.position.y = adapterBottomY + LM_STOWED_CLEARANCE - lmBox.min.y

  rocket.add(lmGroup)
  centerStageGroup(lmGroup)
  lmGroup.visible = false

  // Keep stack order (LM below CSM) in the stage map — inspection's explode
  // spacing follows insertion order.
  const csmGroup = stageGroups.get('CSM')
  if (csmGroup) stageGroups.delete('CSM')
  stageGroups.set('LM', lmGroup)
  if (csmGroup) stageGroups.set('CSM', csmGroup)
}

function buildModelRocketStack(gltf, topGltf, lmGltf) {
  gltf.scene.updateWorldMatrix(true, true)

  const rocket = new THREE.Group()
  rocket.name = 'rocket'
  rocket.userData.source = topGltf
    ? `${SATURN_V_MODEL_URL}, ${SATURN_V_TOP_MODEL_URL}`
    : SATURN_V_MODEL_URL

  const stageGroups = new Map()
  const missingParts = []

  MODEL_STAGE_PARTS.forEach(({ id, parts }) => {
    const stageData = STAGE_SPECS[id]
    const group = createStageGroup(stageData)

    parts.forEach((partName) => {
      const part = gltf.scene.getObjectByName(partName)
      if (!part) {
        missingParts.push(partName)
        return
      }
      group.attach(part)
    })

    if (group.children.length === 0) return

    rocket.add(group)
    centerStageGroup(group)
    stageGroups.set(id, group)
  })

  if (missingParts.length > 0) {
    console.warn(`Saturn V model is missing expected parts: ${missingParts.join(', ')}`)
  }

  if (stageGroups.size === 0) {
    throw new Error('Saturn V model did not contain any expected stage groups.')
  }

  if (stageGroups.has('S-IC') && stageGroups.has('S-II')) {
    addInterstageFiller(stageGroups.get('S-IC'), stageGroups.get('S-II'))
  }
  if (stageGroups.has('S-II') && stageGroups.has('S-IVB')) {
    addInterstageFiller(stageGroups.get('S-II'), stageGroups.get('S-IVB'))
  }

  addTopAssembly({ rocket, stageGroups, topGltf })
  addLunarModule({ rocket, stageGroups, lmGltf })

  return { rocket, stageGroups }
}

export async function buildRocketStack() {
  let gltf
  try {
    gltf = await loadGltf(SATURN_V_MODEL_URL)
  } catch (error) {
    console.error(`Failed to load required Saturn V model at ${SATURN_V_MODEL_URL}.`, error)
    throw error
  }

  let topGltf = null
  try {
    topGltf = await loadGltf(SATURN_V_TOP_MODEL_URL)
  } catch (error) {
    console.warn('Saturn V top model was not loaded; using lower stack only.', error)
  }

  let lmGltf = null
  try {
    lmGltf = await loadGltf(LM_MODEL_URL)
  } catch (error) {
    console.warn('Lunar Module model was not loaded; lunar phases will lack the LM.', error)
  }

  return buildModelRocketStack(gltf, topGltf, lmGltf)
}
