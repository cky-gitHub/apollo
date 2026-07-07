import * as THREE from 'three'
import { buildRadialTexture } from './ExhaustSystem.js'

// One-shot pyrotechnic pops for staging events: a bright expanding flash
// sprite plus a small burst of sparks flying radially out of the separation
// plane. Spawned at world positions, updated from the scene loop.
const FLASH_LIFE = 0.55 // seconds
const SPARK_LIFE = 1.1
const SPARKS_PER_BURST = 12
const DUST_LIFE = 2.6
const DUST_PER_BURST = 26

export class SeparationFlash {
  constructor(scene) {
    this.scene = scene
    this._flashTexture = buildRadialTexture('rgba(255,246,224,1)', 'rgba(255,150,40,0)')
    this._sparkTexture = buildRadialTexture('rgba(255,235,200,1)', 'rgba(255,120,30,0)', 32)
    this._dustTexture = buildRadialTexture('rgba(196,192,184,0.55)', 'rgba(196,192,184,0)')
    this._flashes = []
    this._sparks = []
    this._dust = []
  }

  // Touchdown dust: normal-blended gray sprites blasting radially outward,
  // low and flat — no gravity arc, no glow. In vacuum, kicked regolith flies
  // ballistically and settles fast rather than billowing.
  spawnDust(worldPosition, { speed = 9 } = {}) {
    for (let i = 0; i < DUST_PER_BURST; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this._dustTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      )
      sprite.position.copy(worldPosition)
      const angle = Math.random() * Math.PI * 2
      const radial = speed * (0.4 + Math.random() * 0.9)
      this._dust.push({
        sprite,
        velocity: new THREE.Vector3(
          Math.cos(angle) * radial,
          0.4 + Math.random() * 1.2,
          Math.sin(angle) * radial,
        ),
        age: 0,
        maxLife: DUST_LIFE * (0.6 + Math.random() * 0.4),
      })
      this.scene.add(sprite)
    }
  }

  spawn(worldPosition, { scale = 26, sparkSpeed = 22 } = {}) {
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._flashTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    flash.position.copy(worldPosition)
    this.scene.add(flash)
    this._flashes.push({ sprite: flash, age: 0, scale })

    for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
      const spark = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this._sparkTexture,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      spark.position.copy(worldPosition)
      spark.scale.setScalar(1.6 + Math.random() * 1.4)
      this.scene.add(spark)
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        (Math.random() - 0.5) * 0.6,
        Math.random() - 0.5,
      ).normalize()
      this._sparks.push({
        sprite: spark,
        velocity: direction.multiplyScalar(sparkSpeed * (0.5 + Math.random() * 0.8)),
        age: 0,
      })
    }
  }

  update(dt) {
    for (let i = this._flashes.length - 1; i >= 0; i -= 1) {
      const flash = this._flashes[i]
      flash.age += dt
      const t = flash.age / FLASH_LIFE
      if (t >= 1) {
        this.scene.remove(flash.sprite)
        this._flashes.splice(i, 1)
        continue
      }
      // Fast bloom, fast decay.
      const bloom = Math.sin(Math.min(t * 2.4, 1) * Math.PI * 0.5)
      flash.sprite.scale.setScalar(flash.scale * (0.35 + bloom * 0.65))
      flash.sprite.material.opacity = 1 - t * t
    }

    for (let i = this._sparks.length - 1; i >= 0; i -= 1) {
      const spark = this._sparks[i]
      spark.age += dt
      const t = spark.age / SPARK_LIFE
      if (t >= 1) {
        this.scene.remove(spark.sprite)
        this._sparks.splice(i, 1)
        continue
      }
      spark.velocity.y -= 5 * dt
      spark.sprite.position.addScaledVector(spark.velocity, dt)
      spark.sprite.material.opacity = 1 - t
    }

    for (let i = this._dust.length - 1; i >= 0; i -= 1) {
      const dust = this._dust[i]
      dust.age += dt
      const t = dust.age / dust.maxLife
      if (t >= 1) {
        this.scene.remove(dust.sprite)
        this._dust.splice(i, 1)
        continue
      }
      dust.sprite.position.addScaledVector(dust.velocity, dt)
      dust.sprite.scale.setScalar(2 + t * 9)
      dust.sprite.material.opacity = 0.5 * (1 - t) * Math.min(t * 8, 1)
    }
  }

  clear() {
    this._flashes.forEach((f) => this.scene.remove(f.sprite))
    this._sparks.forEach((s) => this.scene.remove(s.sprite))
    this._dust.forEach((d) => this.scene.remove(d.sprite))
    this._flashes = []
    this._sparks = []
    this._dust = []
  }

  dispose() {
    this.clear()
  }
}
