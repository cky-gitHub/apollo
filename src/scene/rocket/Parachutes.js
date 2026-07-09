import * as THREE from 'three'

// The three Apollo ring-sail mains for the splashdown finale, built
// procedurally (the CSM GLB's chute node is degenerate): orange/white gored
// canopies on straight risers, anchored at the Command Module's apex — the
// parent positions this group, typically at csmBody.userData.apexOffset.
//
// Driven by the reentry beat: setProgress(t) scales the cluster through
// deploy (0 = stowed/hidden, 1 = full), setDeployed() is the instant-safe
// settled form, update(dt) adds a slow pendulum sway while visible.
const CANOPY_RADIUS = 7
const CANOPY_THETA = Math.PI * 0.42 // cap size — most of a hemisphere
const RISER_HEIGHT = 14
const CANOPY_TILT = 0.34 // rad outward lean per chute
const GORE_COUNT = 12

function buildGoreTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  const goreWidth = canvas.width / GORE_COUNT
  for (let i = 0; i < GORE_COUNT; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#f2efe6' : '#e8571e'
    ctx.fillRect(i * goreWidth, 0, goreWidth, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function buildChute(goreTexture) {
  const chute = new THREE.Group()

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(CANOPY_RADIUS, 28, 10, 0, Math.PI * 2, 0, CANOPY_THETA),
    new THREE.MeshStandardMaterial({
      map: goreTexture,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  )
  canopy.scale.y = 0.72
  canopy.position.y = RISER_HEIGHT
  chute.add(canopy)

  // Straight risers from the apex attach point up to the canopy rim.
  const rimY = RISER_HEIGHT + CANOPY_RADIUS * Math.cos(CANOPY_THETA) * canopy.scale.y
  const rimRadius = CANOPY_RADIUS * Math.sin(CANOPY_THETA)
  const positions = []
  const riserCount = 6
  for (let i = 0; i < riserCount; i += 1) {
    const angle = (i / riserCount) * Math.PI * 2
    positions.push(0, 0, 0, Math.cos(angle) * rimRadius, rimY, Math.sin(angle) * rimRadius)
  }
  const riserGeometry = new THREE.BufferGeometry()
  riserGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const risers = new THREE.LineSegments(
    riserGeometry,
    new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.8 }),
  )
  chute.add(risers)

  return chute
}

export class Parachutes {
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'parachutes'
    this.group.visible = false

    const goreTexture = buildGoreTexture()
    this._chutes = []
    for (let i = 0; i < 3; i += 1) {
      const chute = buildChute(goreTexture)
      const angle = (i / 3) * Math.PI * 2 + 0.4
      chute.rotation.set(
        Math.sin(angle) * CANOPY_TILT,
        0,
        -Math.cos(angle) * CANOPY_TILT,
      )
      this.group.add(chute)
      this._chutes.push(chute)
    }

    this._time = 0
    this.setProgress(0)
  }

  // 0 = stowed (hidden), 1 = fully deployed. The beat eases this.
  setProgress(t) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1)
    this._progress = clamped
    this.group.visible = clamped > 0.02
    this.group.scale.setScalar(Math.max(clamped, 0.001))
  }

  setDeployed(deployed) {
    this.setProgress(deployed ? 1 : 0)
  }

  update(dt) {
    if (!this.group.visible) return
    this._time += dt
    // Slow pendulum sway plus a faint canopy breathe.
    this.group.rotation.x = 0.035 * Math.sin(this._time * 0.7)
    this.group.rotation.z = 0.03 * Math.sin(this._time * 0.53 + 1.2)
    const breathe = 1 + 0.015 * Math.sin(this._time * 1.7)
    this.group.scale.setScalar(Math.max(this._progress, 0.001) * breathe)
  }
}
