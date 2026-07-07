import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STAGE_SPECS } from '../../data/stageSpecs.js'

const SATURN_V_MODEL_URL = '/models/Saturn%20V.glb'
const SATURN_V_TOP_MODEL_URL = '/models/very%20top.glb'
const FEET_TO_METERS = 0.3048
const TOP_ADAPTER_HEIGHT = 4.9
const TOP_BODY_BOTTOM_NAME = 'SM Body, Bottom'

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

function createTopAdapter(bottomRadius, topRadius) {
  const adapter = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, TOP_ADAPTER_HEIGHT, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xdeddd6,
      metalness: 0.05,
      roughness: 0.72,
      side: THREE.DoubleSide,
    }),
  )
  adapter.name = 'CSM-SLA-Adapter'
  adapter.userData.stageId = 'CSM'
  return adapter
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

function addTopAssembly({ rocket, stageGroups, topGltf }) {
  if (!topGltf) return

  const topRoot = topGltf.scene
  topRoot.name = 'CSM-LES'
  pruneTopReferenceObjects(topRoot)
  groupLesAssembly(topRoot)
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
  const adapter = createTopAdapter(bottomRadius, topRadius)
  adapter.position.y = lowerTopY + TOP_ADAPTER_HEIGHT / 2

  topRoot.position.y = adapterTopY - bodyBottomY
  topStage.add(adapter)
  topStage.add(topRoot)

  centerStageGroup(topStage)
  rocket.add(topStage)
  stageGroups.set('CSM', topStage)
}

function buildModelRocketStack(gltf, topGltf) {
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

  addTopAssembly({ rocket, stageGroups, topGltf })

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

  return buildModelRocketStack(gltf, topGltf)
}
