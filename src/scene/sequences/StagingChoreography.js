import * as THREE from 'three'
import { ExhaustSystem, EXHAUST_PRESETS } from '../particles/ExhaustSystem.js'
import { SeparationFlash } from '../particles/SeparationFlash.js'

// Powered ascent + staging choreography for phases 3-6 (Max-Q through the
// S-IVB/TLI burn), with settled placeholder states for 7-9 until the lunar
// assets exist.
//
// Driven entirely by flow.phase, per the state machine:
//  - A forward step from the adjacent phase plays that phase's BEAT — a
//    timed cinematic (engine cutoff, retro flash, stage tumbling away, next
//    stage lighting) that ends in the phase's settled flight state.
//  - Any other arrival (backward scroll, test-rig jump, inspect-mode exit)
//    GLIDES to the settled state directly: continuous quantities tween over
//    ~a second, discrete ones (which stages are attached, which engine
//    burns) apply immediately. Every phase is therefore reachable from any
//    other without broken intermediate states.
//
// The rocket group is moved/tilted here; the camera never is — camera
// framing lives in cameraPath.js as rocket-relative poses that track the
// vehicle, so this file and the camera system stay decoupled.
//
// Ownership handshake with LaunchSequence (phases 0-2): while its
// countdown/ignition/liftoff run is in progress it owns the rocket, and this
// module ignores phase changes at or below 2. Entering phase >= 3 (or
// inspect mode) interrupts it, after which this module owns the rocket
// transform for as long as a beat/glide is active or the phase is >= 3.

const DEG = Math.PI / 180
const GLIDE_SECONDS = 0.9
const DEBRIS_GRAVITY = 9 // aesthetic world-units/s^2 — spent stages sink, slowly
const DEBRIS_MAX_AGE_SECONDS = 30
const DEBRIS_MAX_DISTANCE = 1600 // from the rocket; far enough to be sub-pixel

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// Separation beats: momentum bleeds off after cutoff (fast start, flattening)
// until the next stage lights at the knot, then a smooth re-acceleration.
function coastThenBurn(knotT, knotP) {
  return (t) => {
    if (t < knotT) {
      const u = t / knotT
      return knotP * (1 - (1 - u) * (1 - u))
    }
    const u = (t - knotT) / (1 - knotT)
    return knotP + (1 - knotP) * easeInOutCubic(u)
  }
}

// Settled flight state per phase. pos is the rocket group origin (base of
// the stack) in world units; tilt is the gravity-turn lean (rotation.z =
// -tilt, nose toward +X). Absolute numbers are cinematic, not physical —
// the camera rides with the rocket, so only relative motion and the
// receding pad/debris read on screen.
const SETTLED = [
  { pos: [0, 0, 0], tilt: 0, burn: null, sky: 0, pad: 1, stretch: 1, detached: [] },
  { pos: [0, 0, 0], tilt: 0, burn: 'S-IC', sky: 0, pad: 1, stretch: 1, detached: [] },
  { pos: [0, 35, 0], tilt: 0, burn: 'S-IC', sky: 0.35, pad: 1, stretch: 1.35, detached: [] },
  { pos: [24, 420, 0], tilt: 12 * DEG, burn: 'S-IC', sky: 0.62, pad: 0.65, stretch: 2.0, detached: [] },
  { pos: [110, 950, 0], tilt: 27 * DEG, burn: 'S-II', sky: 0.85, pad: 0, stretch: 1.5, detached: ['S-IC'] },
  { pos: [300, 1550, 0], tilt: 45 * DEG, burn: 'S-II', sky: 1, pad: 0, stretch: 1.8, detached: ['S-IC', 'LES'] },
  { pos: [560, 2150, 0], tilt: 63 * DEG, burn: 'S-IVB', sky: 1, pad: 0, stretch: 1.7, detached: ['S-IC', 'LES', 'S-II'] },
  { pos: [700, 2450, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1, detached: ['S-IC', 'LES', 'S-II'] },
  { pos: [700, 2450, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1, detached: ['S-IC', 'LES', 'S-II'] },
  { pos: [700, 2450, 0], tilt: 70 * DEG, burn: null, sky: 1, pad: 0, stretch: 1, detached: ['S-IC', 'LES', 'S-II'] },
]

// Timed beats, keyed by the phase being entered. `at` is seconds from beat
// start. Event handlers take (choreography, instant) — instant means the
// beat is being fast-forwarded (user scrolled again mid-beat / jumped away)
// and only the state change should apply, no pyrotechnics.
const BEATS = {
  // 2 -> 3: throttle through Max-Q. Continuous burn, plume stretches, pad
  // and blue sky fall away, heaviest camera shake of the flight.
  3: {
    duration: 5.0,
    progress: easeInOutCubic,
    valid: (c) => !c._detached.has('S-IC'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._setVibe(1)
          c._exhausts['S-IC'].ignite()
          c._exhausts['S-IC'].setStretch(SETTLED[3].stretch)
        },
      },
      { at: 0.3, run: (c) => c._exhausts['S-IC'].setSmokeEnabled(false) },
    ],
  },
  // 3 -> 4: MECO, S-IC separation, S-II ignition. The money shot: engines
  // snap out, a breath of silent coasting, retro flash, the spent stage
  // tumbles away below, then the J-2s light up blue.
  4: {
    duration: 7.5,
    progress: coastThenBurn(2.05 / 7.5, 0.3),
    valid: (c) => !c._detached.has('S-IC'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._exhausts['S-IC'].extinguish()
          c._setVibe(0.12)
        },
      },
      {
        at: 0.55,
        run: (c, instant) =>
          c._separate('S-IC', instant, {
            // Spent stages inherit only a fraction of the vehicle's motion:
            // the beat easing brings the live rocket to rest in its settled
            // frame, and a stage carrying full velocity would sail past it.
            along: 0.35,
            back: 14,
            lateral: 2,
            spinRate: 0.35,
            flashScale: 34,
            sparkSpeed: 26,
            flashAtTop: true,
          }),
      },
      {
        at: 2.05,
        run: (c, instant) => {
          c._exhausts['S-II'].ignite()
          c._exhausts['S-II'].setStretch(SETTLED[4].stretch)
          c._setVibe(0.9)
          if (!instant) c._igniteFlash('S-II')
        },
      },
    ],
  },
  // 4 -> 5: steady S-II climb; the escape tower rockets away mid-beat.
  5: {
    duration: 6.0,
    progress: easeInOutCubic,
    valid: (c) => !c._detached.has('LES'),
    events: [
      { at: 0, run: (c) => c._exhausts['S-II'].setStretch(SETTLED[5].stretch) },
      {
        at: 2.6,
        run: (c, instant) =>
          c._separate('LES', instant, {
            along: 1,
            back: -34, // fires FORWARD, away from the stack
            lateral: 6,
            spinRate: 1.0,
            flashScale: 10,
            sparkSpeed: 10,
          }),
      },
    ],
  },
  // 5 -> 6: S-II cutoff and separation, S-IVB lights for TLI. Same shape as
  // the first staging but statelier — thinner air, one engine, wider plume.
  6: {
    duration: 7.5,
    progress: coastThenBurn(2.1 / 7.5, 0.3),
    valid: (c) => !c._detached.has('S-II'),
    events: [
      {
        at: 0,
        run: (c) => {
          c._exhausts['S-II'].extinguish()
          c._setVibe(0.12)
        },
      },
      {
        at: 0.6,
        run: (c, instant) =>
          c._separate('S-II', instant, {
            along: 0.35,
            back: 10,
            lateral: 1.5,
            spinRate: 0.18,
            flashScale: 26,
            sparkSpeed: 20,
            flashAtTop: true,
          }),
      },
      {
        at: 2.1,
        run: (c, instant) => {
          c._exhausts['S-IVB'].ignite()
          c._exhausts['S-IVB'].setStretch(SETTLED[6].stretch)
          c._setVibe(0.85)
          if (!instant) c._igniteFlash('S-IVB')
        },
      },
    ],
  },
  // 6 -> 7: TLI complete — S-IVB cutoff, silent drift. (Phases beyond this
  // are camera-only until the lunar assets exist.)
  7: {
    duration: 4.0,
    progress: easeInOutCubic,
    valid: (c) => c._exhausts['S-IVB'].active,
    events: [
      {
        at: 1.0,
        run: (c) => {
          c._exhausts['S-IVB'].extinguish()
          c._setVibe(0)
        },
      },
    ],
  },
}

const LAUNCH_DRIVING_STAGES = new Set(['countdown', 'ignitionHold', 'liftoff'])

export class StagingChoreography {
  constructor({
    flowStore,
    sceneManager,
    scene,
    rocket,
    stageGroups,
    launchSequence,
    sicExhaust,
    skyEnvironment,
    launchPad,
  }) {
    this.flowStore = flowStore
    this.sceneManager = sceneManager
    this.scene = scene
    this.rocket = rocket
    this.stageGroups = stageGroups
    this.launchSequence = launchSequence
    this.skyEnvironment = skyEnvironment
    this.launchPad = launchPad

    this.flash = new SeparationFlash(scene)

    // Upper-stage engines get their own exhaust systems, anchored to their
    // stage groups exactly like the S-IC one built in SceneManager.
    const s2 = stageGroups.get('S-II')
    const s4 = stageGroups.get('S-IVB')
    this._exhausts = {
      'S-IC': sicExhaust,
      'S-II': new ExhaustSystem(
        s2,
        -(s2.userData.bodyLength ?? 0) / 2 + 1.2,
        EXHAUST_PRESETS.J2_CLUSTER,
      ),
      'S-IVB': new ExhaustSystem(
        s4,
        -(s4.userData.bodyLength ?? 0) / 2 + 1.0,
        EXHAUST_PRESETS.J2_SINGLE,
      ),
    }

    // Everything that can leave the stack, with its home attachment +
    // transform so any jump/inspect round-trip can rebuild the full vehicle.
    this._jettisonable = {}
    ;['S-IC', 'S-II'].forEach((id) => this._storeHome(id, stageGroups.get(id)))
    const lesGroup = rocket.getObjectByName('LES')
    if (lesGroup) this._storeHome('LES', lesGroup)

    this._homeRocketPosition = rocket.position.clone()

    // Pad materials cached for the altitude fade. While fading, the pad
    // joins the transparent render pass, where its huge apron sorts as
    // "nearest" (its origin projects behind the camera at altitude) and
    // would get painted OVER the exhaust plume — pin it to the front of the
    // pass so the plume always draws on top of it.
    this._padMaterials = []
    launchPad.traverse((object) => {
      if (object.isMesh) {
        object.renderOrder = -1
        this._padMaterials.push(object.material)
      }
    })
    this._padOpacity = 1

    this._detached = new Set()
    this._debris = []
    this._beat = null
    this._glide = null
    this._vibe = 0
    this._time = 0
    this._rocketVel = new THREE.Vector3()
    this._prevFlightPos = rocket.position.clone()
    this._flightPos = rocket.position.clone()
    this._flightTilt = 0

    const snapshot = flowStore.getSnapshot()
    this._phase = snapshot.flow.phase
    this._mode = snapshot.mode

    this._onStoreChange = this._onStoreChange.bind(this)
    this._unsubscribe = flowStore.subscribe(this._onStoreChange)

    // If the page loads on a phase > 2 (shouldn't normally, but the store is
    // the source of truth), align with it.
    if (this._phase >= 3) this._snapTo(this._phase, { glide: false })
  }

  _storeHome(id, object) {
    if (!object) return
    this._jettisonable[id] = {
      object,
      parent: object.parent,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      // scene.attach() during separation bakes ancestor scale (the GLB's
      // feet->meters factor) into the object; restore needs the original.
      scale: object.scale.clone(),
    }
  }

  // ---------------------------------------------------------------- store

  _onStoreChange() {
    const { mode, flow } = this.flowStore.getSnapshot()

    if (mode !== this._mode) {
      this._mode = mode
      if (mode === 'inspect') this._enterInspect()
      else this._snapTo(flow.phase)
    }

    if (flow.phase !== this._phase) {
      const prev = this._phase
      this._phase = flow.phase
      if (mode !== 'inspect') this._handlePhaseChange(prev, flow.phase)
    }
  }

  _handlePhaseChange(prev, next) {
    const launchDriving = LAUNCH_DRIVING_STAGES.has(this.launchSequence?.stage)

    // Countdown/liftoff owns its own 0 -> 1 -> 2 progression — but only when
    // it was already flying those phases. Arriving from >= 3 (test-rig 'L'
    // restart mid-mission) still needs the stack rebuilt below.
    if (next <= 2 && prev <= 2 && launchDriving) return

    if (next >= 3 && launchDriving) {
      // Test-rig jump out of a running countdown/liftoff: take over, and
      // unlock the scroll stepper that would otherwise wait forever.
      this.launchSequence.interrupt()
      queueMicrotask(() => this.flowStore.completeAutoplay())
    }

    const beat = BEATS[next]
    if (next === prev + 1 && beat && beat.valid(this)) {
      this._startBeat(next, beat)
    } else {
      this._snapTo(next)
    }
  }

  _enterInspect() {
    // Inspection is a diorama, not mission state: interrupt any flight,
    // rebuild the full stack at the pad, kill effects. Exiting re-syncs to
    // whatever phase the flow is on.
    this.launchSequence?.interrupt()
    if (this._beat) this._finishBeat()
    this._glide = null
    this._clearDebris()
    Object.keys(this._jettisonable).forEach((id) => this._restore(id))
    Object.values(this._exhausts).forEach((exhaust) => exhaust.extinguish())
    this.flash.clear()
    this._setVibe(0)

    this.rocket.position.copy(this._homeRocketPosition)
    this.rocket.rotation.set(0, 0, 0)
    this._flightPos.copy(this._homeRocketPosition)
    this._flightTilt = 0

    // Dark starfield backdrop reads best behind the exploded stack.
    this.skyEnvironment.setAltitudeFactor(1)
    this._setPadOpacity(1)
  }

  // ---------------------------------------------------------------- beats

  _startBeat(phase, spec) {
    if (this._beat) this._finishBeat()
    this._beat = {
      phase,
      spec,
      elapsed: 0,
      from: this._captureContinuous(),
      to: SETTLED[phase],
      eventIndex: 0,
    }
  }

  _captureContinuous() {
    return {
      pos: this._flightPos.toArray(),
      tilt: this._flightTilt,
      sky: this.skyEnvironment.dome.material.uniforms.uAltitudeFactor.value,
      pad: this._padOpacity,
    }
  }

  _finishBeat() {
    const beat = this._beat
    this._beat = null
    this._applyContinuous(beat.from, beat.to, 1, 1)
    for (let i = beat.eventIndex; i < beat.spec.events.length; i += 1) {
      beat.spec.events[i].run(this, true)
    }
  }

  _applyContinuous(from, to, motionT, easeT) {
    this._flightPos.set(
      THREE.MathUtils.lerp(from.pos[0], to.pos[0], motionT),
      THREE.MathUtils.lerp(from.pos[1], to.pos[1], motionT),
      THREE.MathUtils.lerp(from.pos[2], to.pos[2], motionT),
    )
    this._flightTilt = THREE.MathUtils.lerp(from.tilt, to.tilt, easeT)
    this.skyEnvironment.setAltitudeFactor(THREE.MathUtils.lerp(from.sky, to.sky, easeT))
    this._setPadOpacity(THREE.MathUtils.lerp(from.pad, to.pad, easeT))
  }

  // ---------------------------------------------------------------- snap

  // Aligns everything with a phase's settled state: discrete facts apply
  // immediately, continuous ones glide over ~a second so jumps don't pop.
  _snapTo(phase, { glide = true } = {}) {
    if (this._beat) this._finishBeat()
    const target = SETTLED[phase]

    this._clearDebris()
    this.flash.clear()
    Object.keys(this._jettisonable).forEach((id) => {
      if (target.detached.includes(id)) this._detachInstant(id)
      else this._restore(id)
    })

    Object.entries(this._exhausts).forEach(([id, exhaust]) => {
      if (id === target.burn) {
        exhaust.ignite()
        exhaust.setStretch(target.stretch)
        if (phase >= 3) exhaust.setSmokeEnabled(false)
      } else {
        exhaust.extinguish()
      }
    })
    this._setVibe(target.burn ? 1 : 0)

    const from = this._captureContinuous()
    if (glide) {
      this._glide = { from, to: target, elapsed: 0 }
    } else {
      this._glide = null
      this._applyContinuous(from, target, 1, 1)
      this._writeRocketTransform()
    }
  }

  // ------------------------------------------------------------ hardware

  _axis() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocket.quaternion)
  }

  _separate(id, instant, opts) {
    if (this._detached.has(id)) return
    const entry = this._jettisonable[id]
    if (!entry) return
    this._detached.add(id)

    if (instant) {
      entry.object.removeFromParent()
      return
    }

    this.scene.attach(entry.object)

    const axis = this._axis()
    const box = new THREE.Box3().setFromObject(entry.object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const halfAlong =
      (size.x * Math.abs(axis.x) + size.y * Math.abs(axis.y) + size.z * Math.abs(axis.z)) / 2

    const flashPos = opts.flashAtTop
      ? center.clone().addScaledVector(axis, halfAlong)
      : center.clone()
    this.flash.spawn(flashPos, { scale: opts.flashScale, sparkSpeed: opts.sparkSpeed })

    const velocity = this._rocketVel
      .clone()
      .multiplyScalar(opts.along)
      .addScaledVector(axis, -opts.back)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * opts.lateral,
          0,
          (Math.random() - 0.5) * opts.lateral,
        ),
      )

    const spinAxis = new THREE.Vector3(0.15 * (Math.random() - 0.5), 0, 1).normalize()
    this._debris.push({
      object: entry.object,
      velocity,
      spinAxis,
      spinRate: opts.spinRate * (0.8 + Math.random() * 0.4),
      age: 0,
    })
  }

  _detachInstant(id) {
    const entry = this._jettisonable[id]
    if (!entry) return
    this._detached.add(id)
    entry.object.removeFromParent()
  }

  _restore(id) {
    const entry = this._jettisonable[id]
    if (!entry) return
    entry.parent.add(entry.object)
    entry.object.position.copy(entry.position)
    entry.object.quaternion.copy(entry.quaternion)
    entry.object.scale.copy(entry.scale)
    entry.object.visible = true
    this._detached.delete(id)
  }

  _clearDebris() {
    this._debris.forEach((d) => d.object.removeFromParent())
    this._debris = []
  }

  _igniteFlash(stageId) {
    const group = this._exhausts[stageId]?.group
    if (!group) return
    const pos = group.getWorldPosition(new THREE.Vector3())
    this.flash.spawn(pos, { scale: 15, sparkSpeed: 9 })
  }

  _setVibe(gain) {
    this._vibe = gain
    this.sceneManager.setShakeGain(gain)
  }

  _setPadOpacity(opacity) {
    const clamped = THREE.MathUtils.clamp(opacity, 0, 1)
    this._padOpacity = clamped
    const solid = clamped >= 0.995
    this.launchPad.visible = clamped > 0.02
    this._padMaterials.forEach((material) => {
      material.transparent = !solid
      material.opacity = clamped
    })
  }

  // ---------------------------------------------------------------- loop

  update(dt) {
    this.flash.update(dt)
    this._exhausts['S-II'].update(dt)
    this._exhausts['S-IVB'].update(dt)

    if (this._mode === 'inspect') return

    this._time += dt
    this._updateDebris(dt)

    let owns = false
    if (this._beat) {
      owns = true
      const beat = this._beat
      beat.elapsed += dt
      const t = Math.min(beat.elapsed / beat.spec.duration, 1)
      this._applyContinuous(beat.from, beat.to, beat.spec.progress(t), easeInOutCubic(t))
      const events = beat.spec.events
      while (beat.eventIndex < events.length && events[beat.eventIndex].at <= beat.elapsed) {
        events[beat.eventIndex].run(this, false)
        beat.eventIndex += 1
      }
      if (t >= 1 && beat.eventIndex >= events.length) this._beat = null
    } else if (this._glide) {
      owns = true
      const glide = this._glide
      glide.elapsed += dt
      const t = Math.min(glide.elapsed / GLIDE_SECONDS, 1)
      const eased = easeInOutCubic(t)
      this._applyContinuous(glide.from, glide.to, eased, eased)
      if (t >= 1) this._glide = null
    } else if (this._phase >= 3) {
      owns = true // settled high-phase state: keep vibration alive
    }

    if (owns) this._writeRocketTransform(dt)
  }

  _writeRocketTransform(dt = 0) {
    // Engine-on vibration: high-frequency sub-meter jitter. The camera
    // follows the smoothed rocket position, so this reads as airframe
    // rumble rather than the whole frame shaking.
    const amp = 0.22 * this._vibe
    const t = this._time
    const jx = amp * (Math.sin(t * 47.3) + 0.5 * Math.sin(t * 71.7))
    const jy = amp * 0.5 * Math.sin(t * 53.9)
    const jz = amp * (Math.sin(t * 43.1 + 1.7) + 0.5 * Math.sin(t * 67.3))

    this.rocket.position.set(
      this._flightPos.x + jx,
      this._flightPos.y + jy,
      this._flightPos.z + jz,
    )
    this.rocket.rotation.set(0, 0, -this._flightTilt + amp * 0.008 * Math.sin(t * 31.7))

    if (dt > 0) {
      // Smoothed flight velocity — seeds separation debris so spent stages
      // inherit the vehicle's motion instead of stopping dead.
      const instVel = this._flightPos.clone().sub(this._prevFlightPos).divideScalar(dt)
      this._rocketVel.lerp(instVel, Math.min(dt * 6, 1))
    }
    this._prevFlightPos.copy(this._flightPos)
  }

  _updateDebris(dt) {
    for (let i = this._debris.length - 1; i >= 0; i -= 1) {
      const debris = this._debris[i]
      debris.age += dt
      debris.velocity.y -= DEBRIS_GRAVITY * dt
      debris.object.position.addScaledVector(debris.velocity, dt)
      debris.object.rotateOnWorldAxis(debris.spinAxis, debris.spinRate * dt)

      const distance = debris.object.position.distanceTo(this.rocket.position)
      if (debris.age > DEBRIS_MAX_AGE_SECONDS || distance > DEBRIS_MAX_DISTANCE) {
        debris.object.removeFromParent()
        this._debris.splice(i, 1)
      }
    }
  }

  dispose() {
    this._unsubscribe()
    this.flash.dispose()
    this._exhausts['S-II'].dispose()
    this._exhausts['S-IVB'].dispose()
    this._clearDebris()
  }
}
