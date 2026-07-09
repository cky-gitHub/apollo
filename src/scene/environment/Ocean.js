import * as THREE from 'three'

// Pacific recovery zone for the splashdown finale: a broad disc of dark
// water that fades in under the descending Command Module as the sky
// gradient returns to blue. Same driving contract as Earth/Moon — apply()
// from the choreography env channel only, never positioned inline.
//
// Like the fading launch pad, it joins the transparent render pass while
// its opacity animates; renderOrder -1 keeps it from painting over the
// reentry plasma, parachutes, and splash spray (see the pad-material note
// in StagingChoreography).
const OCEAN_RADIUS = 3200

function buildWaveBumpTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i += 1) {
    const v = 128 + (Math.random() - 0.5) * 90
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  // Streak the noise horizontally so highlights read as low swell, not grain.
  ctx.globalAlpha = 0.55
  ctx.drawImage(canvas, -2, 0)
  ctx.drawImage(canvas, 3, 1)
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(30, 30)
  return texture
}

export class Ocean {
  constructor(scene) {
    this.group = new THREE.Group()
    this.group.name = 'ocean'
    this.group.visible = false
    scene.add(this.group)

    this._material = new THREE.MeshStandardMaterial({
      color: 0x1d3d58,
      bumpMap: buildWaveBumpTexture(),
      bumpScale: 1.4,
      roughness: 0.42,
      metalness: 0.25,
      transparent: true,
      opacity: 0,
    })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(OCEAN_RADIUS, 64), this._material)
    disc.rotation.x = -Math.PI / 2
    disc.renderOrder = -1
    this.group.add(disc)
  }

  apply(x, y, z, scale, opacity) {
    this.group.position.set(x, y, z)
    this.group.scale.setScalar(Math.max(scale, 0.001))
    this._material.opacity = opacity
    this.group.visible = opacity > 0.01
  }
}
