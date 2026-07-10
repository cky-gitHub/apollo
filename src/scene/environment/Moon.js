import * as THREE from 'three'

// The Moon for phases 7-9. Same driving contract as Earth (apply() from the
// choreography's continuous channel), but this sphere does double duty: it's
// the growing destination during the approach AND the landing terrain in
// phase 9 — the descent flies down to the sphere's top surface, so there's
// no seam where a "terrain patch" would have to take over. A tiled
// procedural crater-field bump map (bowls + raised rims + regolith grain)
// sells surface relief once the LM gets close, where the 4k color map alone
// would read flat.
//
// Texture: NASA SVS "CGI Moon Kit" LROC color map (public domain).
const MOON_TEXTURE_URL = '/textures/moon_lroc_color_4k.jpg'
export const MOON_RADIUS = 1500 // world units at scale 1

// Deterministic PRNG so the crater field (and therefore screenshots) is
// stable across loads.
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Tiled crater-field heightmap: mid-gray regolith base, fine blotted noise,
// then a few hundred craters — each a dark bowl inside a bright raised rim,
// drawn large-to-small so young small craters overprint old big ones, with
// wrap-around copies at the edges so the tiling has no seams. At the
// phase-9/10 repeat density this puts ~10 m to ~150 m craters around the LM,
// which is what sells the surface once the descent gets close.
function buildCraterBumpTexture(size = 1024, craterCount = 380) {
  const random = mulberry32(19690720)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'rgb(128,128,128)'
  ctx.fillRect(0, 0, size, size)

  // Regolith grain: sparse translucent blotches in place of per-pixel noise.
  for (let i = 0; i < 2600; i += 1) {
    const v = 128 + (random() - 0.5) * 90
    const r = 1 + random() * 3.5
    ctx.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`
    ctx.beginPath()
    ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawCrater = (x, y, r, k) => {
    const bowl = ctx.createRadialGradient(x, y, 0, x, y, r)
    bowl.addColorStop(0, `rgba(0,0,0,${0.9 * k})`)
    bowl.addColorStop(0.55, `rgba(30,30,30,${0.65 * k})`)
    bowl.addColorStop(0.72, 'rgba(128,128,128,0)')
    bowl.addColorStop(0.82, `rgba(255,255,255,${0.85 * k})`)
    bowl.addColorStop(0.95, `rgba(200,200,200,${0.2 * k})`)
    bowl.addColorStop(1, 'rgba(128,128,128,0)')
    ctx.fillStyle = bowl
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < craterCount; i += 1) {
    // Power-law sizes: many small, few large; large ones drawn first.
    const t = i / craterCount
    const r = 4 + 65 * (1 - t) ** 2.6 * (0.6 + random() * 0.4)
    const k = 0.5 + random() * 0.5
    const x = random() * size
    const y = random() * size
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (x + dx > -r && x + dx < size + r && y + dy > -r && y + dy < size + r) {
          drawCrater(x + dx, y + dy, r, k)
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(16, 8)
  texture.anisotropy = 8 // surface phases view the ground at grazing angles
  return texture
}

export class Moon {
  constructor(scene) {
    this.group = new THREE.Group()
    this.group.name = 'moon'
    this.group.visible = false
    scene.add(this.group)

    const texture = new THREE.TextureLoader().load(MOON_TEXTURE_URL)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8

    this._material = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: buildCraterBumpTexture(),
      bumpScale: 5.5,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
    })
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 96, 64), this._material)
    // Poles horizontal: the landing happens on the sphere's top, and an
    // equirect map is least distorted at its equator — so put the equator up
    // there. The y-spin picks a mare-ish stretch for the landing site.
    this.sphere.rotation.z = Math.PI / 2
    this.sphere.rotation.y = 1.1
    this.group.add(this.sphere)
  }

  apply(x, y, z, scale, opacity) {
    this.group.position.set(x, y, z)
    this.group.scale.setScalar(Math.max(scale, 0.001))
    this._material.opacity = opacity
    this.group.visible = opacity > 0.01
  }
}
