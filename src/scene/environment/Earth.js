import * as THREE from 'three'

// Earth for the whole mission: the fixed ground sphere of phases 0-6/13 and
// the cislunar marble of 7-12. Position/scale/opacity are driven per-phase
// by StagingChoreography through the same continuous-lerp channel as the
// rocket transform; update() below is the per-frame PRESENTATION pass
// (atmosphere/cloud fades, sun-direction uniforms) — display, not staging.
//
// Textures (public/textures), all raster assets derived from NASA imagery:
//  - earth_blue_marble_8k.jpg — NASA Blue Marble Next Generation, July 2004
//    (world.topo.bathy.200407, 21600x10800 original downsampled to 8192x4096;
//    NASA Visible Earth, public domain). July: the mission month.
//  - earth_night_lights_4800.jpg — NASA "Earth's City Lights" (Visible
//    Earth record 55167, public domain), blended in on the night side of the
//    terminator via a small shader patch.
//  - earth_normal_2048.jpg — terrain relief normal map from the three.js
//    example planet set (MIT-licensed repo asset derived from NASA data).
//  - earth_roughness_2048.jpg — the three.js earth specular water mask,
//    inverted offline into a roughness map: oceans smooth (sun glint),
//    land/cloud matte.
//  - earth_clouds_2048.jpg — NASA cloud fraction composite (Visible Earth
//    record 57747, public domain), used as the alpha of a separate thin
//    cloud shell so the marble reads layered instead of decal-flat.
const EARTH_TEXTURE_URL = import.meta.env.BASE_URL + 'textures/earth_blue_marble_8k.jpg'
const NIGHT_TEXTURE_URL = import.meta.env.BASE_URL + 'textures/earth_night_lights_4800.jpg'
const NORMAL_TEXTURE_URL = import.meta.env.BASE_URL + 'textures/earth_normal_2048.jpg'
const ROUGHNESS_TEXTURE_URL = import.meta.env.BASE_URL + 'textures/earth_roughness_2048.jpg'
const CLOUDS_TEXTURE_URL = import.meta.env.BASE_URL + 'textures/earth_clouds_2048.jpg'
export const EARTH_RADIUS = 1800 // world units at scale 1

const CLOUD_SHELL = 1.004 // clouds float just off the surface
const ATMOSPHERE_SHELL = 1.012 // fresnel rim shell (see the update() note below)

function buildAtmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 1 },
      uSunDirView: { value: new THREE.Vector3(0, 0, 1) },
    },
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
    // Sun-aware rim: the scattering glow only exists where the atmosphere is
    // actually lit — bright cyan-blue on the day limb, warming and dying
    // across the terminator, black on the night side (city lights, not rim
    // glow, carry the dark limb). uOpacity is the camera-altitude fade.
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uSunDirView;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = 1.0 - abs(dot(n, normalize(vViewDir)));
        float glow = pow(rim, 3.0);
        float lit = clamp(dot(n, uSunDirView) * 1.6 + 0.35, 0.0, 1.0);
        // Deep blue in thin light, pale blue-white at full sun.
        vec3 color = mix(vec3(0.12, 0.32, 0.85), vec3(0.55, 0.78, 1.0), lit);
        float a = glow * lit * uOpacity;
        gl_FragColor = vec4(color * a, a);
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

    // Shared by the surface patch and the atmosphere shader; updated per
    // frame in update() from the key light (which IS the visible Sun).
    this._sunDirView = new THREE.Vector3(0, 0, 1)

    const loader = new THREE.TextureLoader()
    const colorTexture = loader.load(EARTH_TEXTURE_URL)
    colorTexture.colorSpace = THREE.SRGBColorSpace
    // High anisotropy: during ascent (phases 3-6) the camera skims low over
    // the globe and reads the surface at grazing angles.
    colorTexture.anisotropy = 16

    const nightTexture = loader.load(NIGHT_TEXTURE_URL)
    nightTexture.colorSpace = THREE.SRGBColorSpace
    nightTexture.anisotropy = 8

    const normalTexture = loader.load(NORMAL_TEXTURE_URL)
    const roughnessTexture = loader.load(ROUGHNESS_TEXTURE_URL)

    this._surfaceMaterial = new THREE.MeshStandardMaterial({
      map: colorTexture,
      normalMap: normalTexture,
      // Subtle: the sphere is planet-huge, so terrain relief should whisper,
      // not read like hammered metal.
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: roughnessTexture,
      roughness: 1, // multiplies the map: oceans ~0.35 (glint), land ~0.95
      metalness: 0,
      transparent: true,
      opacity: 0,
    })

    // Night-side city lights: patched into the standard shader so they obey
    // the SAME sun the lighting uses — emissive only past the terminator,
    // fading in across it. geometryNormal (view space) dot the view-space
    // sun direction gives the day/night factor.
    this._surfaceMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uNightMap = { value: nightTexture }
      shader.uniforms.uSunDirView = { value: this._sunDirView }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uNightMap;
          uniform vec3 uSunDirView;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // nonPerturbedNormal: the view-space geometric normal, declared
            // in normal_fragment_begin (geometryNormal only exists later, in
            // lights_fragment_begin — after this emissive hook).
            float dayFactor = dot(nonPerturbedNormal, uSunDirView);
            float nightSide = smoothstep(0.05, -0.18, dayFactor);
            vec3 cityLights = texture2D(uNightMap, vMapUv).rgb;
            // Shape + warm the sodium-vapor glow; the raw map has a gray cast.
            cityLights = pow(cityLights, vec3(1.35)) * vec3(1.0, 0.82, 0.58);
            totalEmissiveRadiance += cityLights * nightSide * 1.4;
          }`,
        )
    }

    // Dense tessellation: as the ground-Earth of phases 0-6 (scaled to a
    // 40k-unit sphere, see missionSpace.js) its limb IS the horizon line
    // during ascent, and a 64-segment silhouette visibly scallops at that
    // grazing range.
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 128, 96),
      this._surfaceMaterial,
    )
    // Orientation does double duty: the z-tilt puts a subtropical ~28°N
    // point at the sphere's TOP — which is where the launch pad sits when
    // this sphere is the ground (missionSpace.js groundMark) — and with
    // 'ZYX' order the y-spin then chooses WHICH longitude that is, so the
    // ascent reads blue Atlantic/coast below rather than the polar ice or
    // Sahara other spins land on. The same orientation is the marble face
    // of the phase-7+ shots.
    // (Solved: with these rotations the top point is lat 28.7°N lon 80°W —
    // Cape Canaveral. SphereGeometry maps u=0 to lon -180 at -X; the ZYX
    // spin puts texture longitude (180° - y·RAD2DEG) under the top.)
    this.sphere.rotation.order = 'ZYX'
    this.sphere.rotation.z = 1.07
    this.sphere.rotation.y = 1.4
    this.group.add(this.sphere)

    // Cloud shell: NASA cloud fraction as the alpha of a thin white layer.
    // Sun-shaded like the surface (so clouds go dark past the terminator)
    // and faded with the same camera-altitude factor as the rim — from
    // inside the atmosphere you're UNDER the weather, not looking at a
    // painted shell 120 m over the launch pad.
    const cloudsTexture = loader.load(CLOUDS_TEXTURE_URL)
    cloudsTexture.anisotropy = 8
    this._cloudMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      alphaMap: cloudsTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * CLOUD_SHELL, 96, 64),
      this._cloudMaterial,
    )
    this.clouds.rotation.copy(this.sphere.rotation)
    this.clouds.renderOrder = 1
    this.group.add(this.clouds)

    this._atmosphereMaterial = buildAtmosphereMaterial()
    // Thin shell: at ground scale (40k radius) 1.2% is ~480 units, so the
    // ascent camera exits the atmosphere around S-IC staging and the blue
    // limb rim appears over the horizon from then on — inside the shell the
    // front-side-only rim is invisible, which is also correct (you don't see
    // the limb glow from within the atmosphere).
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * ATMOSPHERE_SHELL, 128, 96),
      this._atmosphereMaterial,
    )
    this.atmosphere.renderOrder = 2
    this.group.add(this.atmosphere)
  }

  // Single entry point for the choreography's continuous channel.
  apply(x, y, z, scale, opacity) {
    this.group.position.set(x, y, z)
    this.group.scale.setScalar(Math.max(scale, 0.001))
    this._surfaceMaterial.opacity = opacity
    this._envOpacity = opacity
    this.group.visible = opacity > 0.01
  }

  // Per-frame presentation pass (SceneManager._animate).
  //  - The fresnel rim is a from-space effect — seen from just above the
  //    shell every fragment is grazing-angle and the "rim" floods the whole
  //    lower frame as a flat blue wash. Fade it (and the cloud shell) with
  //    the camera's altitude above the shell, so the low ascent reads clear
  //    air, the limb glow builds as the vehicle leaves the atmosphere, and
  //    the marble phases keep their full rim.
  //  - The sun direction (keyLight IS the visible Sun) is pushed to the
  //    surface and atmosphere shaders in view space, driving the night-lights
  //    terminator and the lit-limb falloff.
  update(camera, keyLight) {
    const scale = this.group.scale.x
    const shellRadius = EARTH_RADIUS * ATMOSPHERE_SHELL * scale
    const altitude = camera.position.distanceTo(this.group.position) - shellRadius
    const fade = THREE.MathUtils.clamp(altitude / (shellRadius * 0.05), 0, 1)
    this._atmosphereMaterial.uniforms.uOpacity.value = (this._envOpacity ?? 0) * fade
    this._cloudMaterial.opacity = (this._envOpacity ?? 0) * fade * 0.9

    this._sunDirView
      .copy(keyLight.position)
      .normalize()
      .transformDirection(camera.matrixWorldInverse)
    this._atmosphereMaterial.uniforms.uSunDirView.value.copy(this._sunDirView)
  }
}
