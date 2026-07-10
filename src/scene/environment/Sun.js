import * as THREE from 'three'

// The Sun as a visible body: a billboarded disc with a hot white core and a
// warm corona falloff. It is the SAME source as the scene's key light — its
// world direction is locked to the DirectionalLight every frame (see
// SceneManager), so the lit hemisphere of Earth/Moon always faces the disc
// you can see. Rendered at a fixed radius that rides the camera (like the sky
// dome and stars), so it reads as infinitely distant: no parallax as the
// vehicle moves, and it sits inside the star shell / sky dome.
const SUN_DISTANCE = 3600 // < star radius (3800) and dome radius (4000)

// Radial gradient: opaque white core -> warm rim -> transparent corona.
// With additive blending the core blows out to pure white over black while
// the corona only tints, which is what sells "too bright to look at."
function buildSunTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.14, 'rgba(255,252,242,1)')
  g.addColorStop(0.24, 'rgba(255,240,205,0.95)')
  g.addColorStop(0.42, 'rgba(255,214,150,0.45)')
  g.addColorStop(0.68, 'rgba(255,190,120,0.14)')
  g.addColorStop(1.0, 'rgba(255,180,110,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class Sun {
  constructor(scene) {
    this._material = new THREE.SpriteMaterial({
      map: buildSunTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      // rotation-invariant billboard; toneMapped off so the core stays pinned
      // at full white rather than being rolled off by exposure.
      toneMapped: false,
    })
    this.sprite = new THREE.Sprite(this._material)
    this.sprite.name = 'sun'
    // The disc is ~a third of the corona; the texture's falloff carries the
    // rest. Diameter in world units at SUN_DISTANCE (screen size is constant
    // because the disc rides the camera at a fixed distance).
    this.sprite.scale.setScalar(900)
    this.sprite.visible = false
    this.sprite.renderOrder = 2 // after the bodies, so it layers on top of them
    scene.add(this.sprite)

    this._dir = new THREE.Vector3(0, 1, 0)
  }

  // Called every frame with the camera and the key light. The light travels
  // from keyLight.position toward the origin, so the direction TO the sun is
  // simply the light's (normalized) position — placing the disc there makes
  // the visible sun and the incident light one and the same.
  update(camera, keyLight, opacity = 1) {
    this._dir.copy(keyLight.position).normalize()
    this.sprite.position.copy(camera.position).addScaledVector(this._dir, SUN_DISTANCE)
    this._material.opacity = opacity
    this.sprite.visible = opacity > 0.01
  }
}
