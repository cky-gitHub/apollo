import * as THREE from 'three'

// The Moon for phases 7-9. Same driving contract as Earth (apply() from the
// choreography's continuous channel), but this sphere does double duty: it's
// the growing destination during the approach AND the landing terrain in
// phase 9 — the descent flies down to the sphere's top surface, so there's
// no seam where a "terrain patch" would have to take over. A tiled
// canvas-noise bump map sells surface relief once the LM gets close, where
// the 4k color map alone would read flat.
//
// Texture: NASA SVS "CGI Moon Kit" LROC color map (public domain).
const MOON_TEXTURE_URL = '/textures/moon_lroc_color_4k.jpg'
export const MOON_RADIUS = 1500 // world units at scale 1

function buildNoiseBumpTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i += 1) {
    const v = 128 + (Math.random() - 0.5) * 110
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  // A soft self-blot pass turns per-pixel noise into blobbier, regolith-like
  // patches instead of TV static.
  ctx.globalAlpha = 0.5
  ctx.drawImage(canvas, -1, 0)
  ctx.drawImage(canvas, 1, 1)
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(48, 24)
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
      bumpMap: buildNoiseBumpTexture(),
      bumpScale: 2.2,
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
