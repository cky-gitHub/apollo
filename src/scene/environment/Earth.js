import * as THREE from 'three'

// Earth for the trans-lunar phases (7+): a textured sphere plus a thin
// additive fresnel-rim atmosphere shell. Not to scale — a cinematic backdrop
// whose position/scale/opacity are driven per-phase by StagingChoreography
// through the same continuous-lerp channel as the rocket transform.
//
// Texture: NASA Blue Marble (land_ocean_ice_cloud, public domain), loaded
// async at construction so it's resident long before phase 7 reveals it.
const EARTH_TEXTURE_URL = '/textures/earth_blue_marble_2048.jpg'
export const EARTH_RADIUS = 1800 // world units at scale 1

function buildAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
        float glow = pow(rim, 3.2);
        gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * glow, glow * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  })
}

export class Earth {
  constructor(scene) {
    this.group = new THREE.Group()
    this.group.name = 'earth'
    this.group.visible = false
    scene.add(this.group)

    const texture = new THREE.TextureLoader().load(EARTH_TEXTURE_URL)
    texture.colorSpace = THREE.SRGBColorSpace
    // High anisotropy: during ascent (phases 3-6) the camera skims low over the
    // globe and reads the surface at grazing angles, where the 2k map smears
    // without it.
    texture.anisotropy = 16

    this._surfaceMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
    })
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 64, 48),
      this._surfaceMaterial,
    )
    // Tip the pole so the disc reads as the familiar tilted globe rather
    // than a map-straight equator.
    this.sphere.rotation.z = 0.35
    this.sphere.rotation.y = 2.4
    this.group.add(this.sphere)

    this._atmosphereMaterial = buildAtmosphereMaterial()
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.025, 64, 48),
      this._atmosphereMaterial,
    )
    this.group.add(this.atmosphere)
  }

  // Single entry point for the choreography's continuous channel.
  apply(x, y, z, scale, opacity) {
    this.group.position.set(x, y, z)
    this.group.scale.setScalar(Math.max(scale, 0.001))
    this._surfaceMaterial.opacity = opacity
    this._atmosphereMaterial.uniforms.uOpacity.value = opacity
    this.group.visible = opacity > 0.01
  }
}
