import * as THREE from 'three'

// Rough placeholder sky: a big inverted dome with a shader gradient (blue
// near the "ground" edge, near-black toward the top), plus a star point
// field that fades in as altitudeFactor rises. altitudeFactor is driven by
// LaunchSequence (0 = on the pad, 1 = at hold altitude) — not a literal
// unit conversion, just a 0-1 progress knob for "how far above the
// atmosphere we're reading as."
const DOME_RADIUS = 4000
const STAR_COUNT = 2500
const DAY_BLUE = new THREE.Color(0x1f5c99)
const NIGHT_COLOR = new THREE.Color(0x05070a)

function buildSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDayColor: { value: DAY_BLUE.clone() },
      uNightColor: { value: NIGHT_COLOR.clone() },
      uAltitudeFactor: { value: 0 },
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDayColor;
      uniform vec3 uNightColor;
      uniform float uAltitudeFactor;
      varying vec3 vLocalPosition;
      void main() {
        // Object-space direction so the gradient stays put when the dome is
        // recentered on the camera during flight.
        float h = clamp(normalize(vLocalPosition).y * 0.5 + 0.5, 0.0, 1.0);
        vec3 base = mix(uDayColor, uNightColor, smoothstep(0.0, 0.8, h));
        vec3 finalColor = mix(base, uNightColor, uAltitudeFactor);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  })
}

function buildStarField() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const radius = DOME_RADIUS * 0.95
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(Math.random()) // upper hemisphere-weighted
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.cos(phi)
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  return new THREE.Points(geometry, material)
}

export class SkyEnvironment {
  constructor(scene) {
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), buildSkyMaterial())
    this.dome.name = 'sky-dome'
    this.dome.renderOrder = -1
    scene.add(this.dome)

    this.stars = buildStarField()
    this.stars.name = 'star-field'
    scene.add(this.stars)
  }

  setAltitudeFactor(t) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1)
    this.dome.material.uniforms.uAltitudeFactor.value = clamped
    this.stars.material.opacity = clamped
  }

  // Keeps the dome/starfield centered on the camera so the backdrop never
  // runs out no matter how high the flight path climbs. The gradient is
  // object-space, so recentering doesn't shift it.
  followCamera(cameraPosition) {
    this.dome.position.copy(cameraPosition)
    this.stars.position.copy(cameraPosition)
  }
}
