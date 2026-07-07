import * as THREE from 'three'

// Engine exhaust: per-engine additive plume cones + glow sprites, with an
// optional pad-anchored smoke/steam field. Configured per stage via
// EXHAUST_PRESETS (sea-level F-1 cluster vs vacuum J-2s — vacuum plumes are
// wide, translucent and blue, and produce no smoke).
//
// Runtime knobs used by the launch/staging choreography:
//  - ignite()/extinguish(): engines on/off
//  - setStretch(k): lengthens the plume with vehicle speed/altitude
//  - setSmokeEnabled(false): stops smoke respawn once clear of the pad

export function buildRadialTexture(innerColor, outerColor, size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(1, outerColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Vertical gradient for plume cones: stops run top (nozzle/apex, v=1) to
// bottom (plume tail, v=0).
function buildPlumeTexture(stops, width = 16, height = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  return new THREE.CanvasTexture(canvas)
}

export const EXHAUST_PRESETS = {
  // Five F-1s at sea level: tight, blinding orange-white columns + pad smoke.
  F1_CLUSTER: {
    engineCount: 5,
    layoutRadius: 2.6,
    nozzleRadius: 1.5,
    plumeLength: 30,
    flare: 2.2,
    coreStops: [
      [0, 'rgba(255,248,222,0.95)'],
      [0.25, 'rgba(255,214,120,0.85)'],
      [0.6, 'rgba(255,120,30,0.4)'],
      [1, 'rgba(180,40,10,0)'],
    ],
    glowStops: [
      [0, 'rgba(255,200,120,0.4)'],
      [0.5, 'rgba(255,110,30,0.16)'],
      [1, 'rgba(120,30,10,0)'],
    ],
    spriteInner: 'rgba(255,244,214,1)',
    spriteOuter: 'rgba(255,110,20,0)',
    spriteScale: [3.4, 8],
    smoke: true,
  },
  // Five J-2s in vacuum: near-transparent blue-white bells, wide expansion.
  J2_CLUSTER: {
    engineCount: 5,
    layoutRadius: 2.3,
    nozzleRadius: 1.2,
    plumeLength: 22,
    flare: 4.2,
    coreStops: [
      [0, 'rgba(235,244,255,0.85)'],
      [0.3, 'rgba(170,205,255,0.5)'],
      [0.7, 'rgba(90,140,255,0.18)'],
      [1, 'rgba(50,80,220,0)'],
    ],
    glowStops: [
      [0, 'rgba(190,215,255,0.3)'],
      [0.5, 'rgba(110,150,255,0.1)'],
      [1, 'rgba(60,80,220,0)'],
    ],
    spriteInner: 'rgba(240,248,255,1)',
    spriteOuter: 'rgba(110,160,255,0)',
    spriteScale: [2.6, 5],
    smoke: false,
  },
  // CSM Service Propulsion System: single hypergolic engine, pale
  // orange-pink translucent vacuum plume. Burns during lunar-orbit braking.
  SPS_SINGLE: {
    engineCount: 1,
    layoutRadius: 0,
    nozzleRadius: 0.95,
    plumeLength: 11,
    flare: 3.6,
    coreStops: [
      [0, 'rgba(255,240,228,0.85)'],
      [0.3, 'rgba(255,196,160,0.5)'],
      [0.7, 'rgba(255,140,110,0.18)'],
      [1, 'rgba(220,90,80,0)'],
    ],
    glowStops: [
      [0, 'rgba(255,214,190,0.3)'],
      [0.5, 'rgba(255,150,120,0.1)'],
      [1, 'rgba(220,90,80,0)'],
    ],
    spriteInner: 'rgba(255,244,232,1)',
    spriteOuter: 'rgba(255,150,110,0)',
    spriteScale: [2.2, 4.2],
    smoke: false,
  },
  // LM Descent Propulsion System: smaller hypergolic bell for the powered
  // descent — modest plume that still reads against the lunar surface.
  DPS_SINGLE: {
    engineCount: 1,
    layoutRadius: 0,
    nozzleRadius: 0.7,
    plumeLength: 7,
    flare: 3.0,
    coreStops: [
      [0, 'rgba(255,242,230,0.9)'],
      [0.3, 'rgba(255,200,164,0.55)'],
      [0.7, 'rgba(255,150,116,0.2)'],
      [1, 'rgba(220,100,84,0)'],
    ],
    glowStops: [
      [0, 'rgba(255,218,194,0.32)'],
      [0.5, 'rgba(255,156,124,0.12)'],
      [1, 'rgba(220,100,84,0)'],
    ],
    spriteInner: 'rgba(255,246,236,1)',
    spriteOuter: 'rgba(255,156,116,0)',
    spriteScale: [1.7, 3.2],
    smoke: false,
  },
  // Single vacuum J-2 (S-IVB).
  J2_SINGLE: {
    engineCount: 1,
    layoutRadius: 0,
    nozzleRadius: 1.15,
    plumeLength: 20,
    flare: 4.8,
    coreStops: [
      [0, 'rgba(235,244,255,0.9)'],
      [0.3, 'rgba(170,205,255,0.55)'],
      [0.7, 'rgba(90,140,255,0.2)'],
      [1, 'rgba(50,80,220,0)'],
    ],
    glowStops: [
      [0, 'rgba(190,215,255,0.32)'],
      [0.5, 'rgba(110,150,255,0.12)'],
      [1, 'rgba(60,80,220,0)'],
    ],
    spriteInner: 'rgba(240,248,255,1)',
    spriteOuter: 'rgba(110,160,255,0)',
    spriteScale: [2.8, 5.5],
    smoke: false,
  },
}

const SMOKE_COUNT = 70

function enginePositions(count, radius) {
  // Quincunx: one center engine, the rest evenly spread on the ring.
  const positions = [new THREE.Vector3(0, 0, 0)]
  for (let i = 1; i < count; i += 1) {
    const angle = ((i - 1) / (count - 1)) * Math.PI * 2 + Math.PI / 4
    positions.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return positions.slice(0, count)
}

export class ExhaustSystem {
  // anchor: parent object the plume is attached to (a stage group).
  // offsetY: local-space Y of the engine nozzle exits within that anchor.
  // options.smokeAnchor/options.smokeOrigin: where smoke lives — pass the
  // scene + pad position so the steam cloud stays at the pad instead of
  // riding up with the rocket.
  constructor(anchor, offsetY = 0, preset = EXHAUST_PRESETS.F1_CLUSTER, options = {}) {
    this._config = preset
    this.group = new THREE.Group()
    this.group.name = 'exhaust'
    this.group.position.y = offsetY
    this.group.visible = false
    anchor.add(this.group)

    this._active = false
    this._time = 0
    this._stretch = 1
    this._stretchTarget = 1
    this._smokeActive = false

    this._buildFlames()
    if (preset.smoke) this._buildSmoke(options.smokeAnchor ?? this.group, options.smokeOrigin)
  }

  _buildFlames() {
    const cfg = this._config
    const positions = enginePositions(cfg.engineCount, cfg.layoutRadius)

    // Per-engine core cones: apex at the nozzle, expanding downward.
    const coreTexture = buildPlumeTexture(cfg.coreStops)
    const coreGeometry = new THREE.CylinderGeometry(
      cfg.nozzleRadius * 0.55,
      cfg.nozzleRadius * cfg.flare,
      1,
      20,
      1,
      true,
    )
    coreGeometry.translate(0, -0.5, 0)
    this._cones = positions.map((p) => {
      const cone = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({
          map: coreTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      cone.position.set(p.x, -0.6, p.z)
      this.group.add(cone)
      return cone
    })

    // One wider, fainter glow cone wrapping the whole cluster.
    const glowTexture = buildPlumeTexture(cfg.glowStops)
    const clusterRadius = (cfg.layoutRadius + cfg.nozzleRadius) * 1.15
    const glowGeometry = new THREE.CylinderGeometry(
      Math.max(clusterRadius, cfg.nozzleRadius * 1.3),
      Math.max(clusterRadius, cfg.nozzleRadius * 1.3) * cfg.flare,
      1,
      24,
      1,
      true,
    )
    glowGeometry.translate(0, -0.5, 0)
    this._glowCone = new THREE.Mesh(
      glowGeometry,
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this._glowCone.position.y = -0.4
    this.group.add(this._glowCone)

    // Per-engine glow sprites at the nozzle exits — the bright "source" dots.
    const spriteTexture = buildRadialTexture(cfg.spriteInner, cfg.spriteOuter)
    this._flames = positions.map((p) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spriteTexture,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      sprite.position.set(p.x, -1.6, p.z)
      sprite.scale.set(cfg.spriteScale[0], cfg.spriteScale[1], 1)
      this.group.add(sprite)
      return sprite
    })
  }

  _buildSmoke(smokeAnchor, smokeOrigin) {
    const texture = buildRadialTexture('rgba(230,230,224,0.85)', 'rgba(230,230,224,0)')
    this._smokeGroup = new THREE.Group()
    this._smokeGroup.name = 'exhaust-smoke'
    if (smokeOrigin) this._smokeGroup.position.set(...smokeOrigin)
    this._smokeGroup.visible = false
    smokeAnchor.add(this._smokeGroup)

    this._smoke = []
    for (let i = 0; i < SMOKE_COUNT; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
      )
      const particle = { sprite, velocity: new THREE.Vector3(), life: 0, maxLife: 1 }
      this._resetSmokeParticle(particle, true)
      this._smokeGroup.add(sprite)
      this._smoke.push(particle)
    }
  }

  _resetSmokeParticle(particle, randomizeLife = false) {
    // Pad steam: blasts outward along the deflector, low and wide.
    const angle = Math.random() * Math.PI * 2
    const r = 3 + Math.random() * 5
    particle.sprite.position.set(Math.cos(angle) * r, 1 + Math.random() * 2, Math.sin(angle) * r)
    particle.velocity.set(
      Math.cos(angle) * (7 + Math.random() * 8),
      1.5 + Math.random() * 2.5,
      Math.sin(angle) * (7 + Math.random() * 8),
    )
    particle.maxLife = 2.4 + Math.random() * 1.8
    particle.life = randomizeLife ? Math.random() * particle.maxLife : 0
  }

  ignite() {
    this._active = true
    this.group.visible = true
    this._smokeActive = Boolean(this._config.smoke && this._smoke)
    if (this._smokeGroup) this._smokeGroup.visible = this._smokeActive
  }

  extinguish() {
    this._active = false
    this.group.visible = false
    this._smokeActive = false
    if (this._smokeGroup) this._smokeGroup.visible = false
    this._smoke?.forEach((p) => {
      p.life = p.maxLife
      p.sprite.material.opacity = 0
    })
  }

  get active() {
    return this._active
  }

  // 1 = pad-level plume; higher values lengthen it (speed/altitude read).
  // Smoothed in update() so throttle changes don't pop.
  setStretch(k) {
    this._stretchTarget = k
  }

  setSmokeEnabled(enabled) {
    this._smokeActive = Boolean(enabled && this._config.smoke && this._active)
    if (this._smokeGroup && enabled) this._smokeGroup.visible = this._smokeActive
  }

  update(dt) {
    // Smoke keeps dissipating even mid-extinguish so it fades, not pops.
    if (this._smokeGroup?.visible) this._updateSmoke(dt)
    if (!this._active) return

    this._time += dt
    this._stretch += (this._stretchTarget - this._stretch) * Math.min(dt * 3, 1)

    const cfg = this._config
    this._flames.forEach((sprite, i) => {
      const flicker =
        0.85 + 0.15 * Math.sin(this._time * 18 + i * 1.7) + 0.05 * Math.sin(this._time * 47 + i)
      sprite.scale.set(cfg.spriteScale[0] * flicker, cfg.spriteScale[1] * flicker, 1)
      sprite.material.opacity = 0.85 * flicker
    })

    this._cones.forEach((cone, i) => {
      const flicker = 0.92 + 0.08 * Math.sin(this._time * 23 + i * 2.3)
      cone.scale.set(flicker, cfg.plumeLength * this._stretch * flicker, flicker)
      cone.material.opacity = 0.95 * flicker
    })

    const glowFlicker = 0.9 + 0.1 * Math.sin(this._time * 13)
    this._glowCone.scale.set(
      glowFlicker,
      cfg.plumeLength * 1.25 * this._stretch * glowFlicker,
      glowFlicker,
    )
    this._glowCone.material.opacity = 0.8 * glowFlicker
  }

  _updateSmoke(dt) {
    let anyAlive = false
    this._smoke.forEach((particle) => {
      particle.life += dt
      if (particle.life >= particle.maxLife) {
        if (!this._smokeActive) {
          particle.sprite.material.opacity = 0
          return
        }
        this._resetSmokeParticle(particle)
      }
      anyAlive = true
      const t = particle.life / particle.maxLife
      particle.sprite.position.addScaledVector(particle.velocity, dt)
      particle.sprite.scale.setScalar(4 + t * 16)
      particle.sprite.material.opacity = 0.42 * (1 - t) * Math.min(t * 6, 1)
    })
    if (!anyAlive && !this._smokeActive) this._smokeGroup.visible = false
  }

  dispose() {
    this.group.parent?.remove(this.group)
    this._smokeGroup?.parent?.remove(this._smokeGroup)
  }
}
