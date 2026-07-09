import * as THREE from 'three'
import { buildRocketStack } from './rocket/RocketAssembly.js'
import {
  getCameraPose,
  resolvePoseWorld,
  orbitOffset,
  DEFAULT_TRANSITION_DURATION,
} from './cameraPath.js'
import { InspectionController } from './inspection.js'
import { SpaceStepper } from './spaceStepper.js'
import { FreeLookControl } from './freeLook.js'
import { PhaseTestRig } from './phaseTestRig.js' // TEMP: test rig — remove before ship
import { buildLaunchPad } from './environment/LaunchPad.js'
import { SkyEnvironment } from './environment/Sky.js'
import { Earth } from './environment/Earth.js'
import { Moon } from './environment/Moon.js'
import { Ocean } from './environment/Ocean.js'
import { ExhaustSystem, EXHAUST_PRESETS } from './particles/ExhaustSystem.js'
import { LaunchSequence } from './sequences/LaunchSequence.js'
import { StagingChoreography } from './sequences/StagingChoreography.js'

// Exponential smoothing rate for the camera chasing its resolved pose. High
// enough to feel locked-on, low enough that vehicle accelerations (staging
// kicks, engine lights) visibly surge in frame before the camera catches up.
const CAMERA_FOLLOW_LAMBDA = 7
const SHAKE_GAIN_LAMBDA = 4

// Camera offset for entering inspect mode, added to the current stack's
// world-space focus point (inspection.getFocusWorldPosition() — NOT a fixed
// pad spot, since inspection no longer repositions the vehicle: it freezes
// wherever the mission currently is).
const INSPECT_CAMERA_OFFSET = new THREE.Vector3(92, 36, 228)

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export class SceneManager {
  constructor(container, flowStore) {
    this.container = container
    this.flowStore = flowStore

    this.scene = new THREE.Scene()
    // The sky dome (see environment/Sky.js) replaces a flat scene.background
    // color — it's a gradient that shifts with altitude, matching --mc-bg
    // in src/styles/theme.css at its darkest so canvas and page chrome still
    // read as one continuous surface once at altitude.

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      10000,
    )

    this.currentPhase = 0
    this._cameraTransition = null
    this._autoOrbitAngle = 0
    this._manualAzimuth = 0
    this._manualPolar = 0
    this._shakeGain = 0
    this._shakeGainTarget = 1
    this._shakeTime = 0

    const initialPose = getCameraPose(this.currentPhase)
    this._camPos = new THREE.Vector3(...initialPose.position)
    this._camTarget = new THREE.Vector3(...initialPose.target)
    this.camera.position.copy(this._camPos)
    this.camera.lookAt(this._camTarget)

    // Scratch vectors reused every frame by the camera resolver.
    this._poseFromPos = new THREE.Vector3()
    this._poseFromTarget = new THREE.Vector3()
    this._poseToPos = new THREE.Vector3()
    this._poseToTarget = new THREE.Vector3()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(this.renderer.domElement)

    // Strong directional "sun" light.
    this.keyLight = new THREE.DirectionalLight(0xfff4e6, 3.5)
    this.keyLight.position.set(180, 220, 120)
    this.scene.add(this.keyLight)

    // Dim ambient fill so shadowed faces aren't pure black.
    this.fillLight = new THREE.HemisphereLight(0x8fa8c9, 0x141414, 0.35)
    this.scene.add(this.fillLight)

    this.sky = new SkyEnvironment(this.scene)
    this.launchPad = buildLaunchPad()
    this.scene.add(this.launchPad)

    // Trans-lunar backdrop bodies, hidden until the choreography reveals
    // them from phase 7 on.
    this.earth = new Earth(this.scene)
    this.moon = new Moon(this.scene)
    // Pacific recovery zone, hidden until the reentry beat fades it in.
    this.ocean = new Ocean(this.scene)

    this.rocket = null
    this.stageGroups = new Map()
    this.inspection = null
    this.exhaust = null
    this.launchSequence = null
    this.choreography = null

    this._labelContainer = document.createElement('div')
    this._labelContainer.style.position = 'absolute'
    this._labelContainer.style.inset = '0'
    this._labelContainer.style.pointerEvents = 'none'
    this._labelContainer.style.display = 'none'
    container.appendChild(this._labelContainer)

    this.spaceStepper = new SpaceStepper({ flowStore })
    this.freeLook = new FreeLookControl({
      domElement: this.renderer.domElement,
      flowStore,
      onOrbit: (azimuthDelta, polarDelta) => {
        if (this.mode === 'inspect') {
          // Inspect mode's camera is OrbitControls-driven, not routed
          // through cameraPath.js — rotate it directly around its own
          // target using the same spherical math, instead of the
          // flow-mode _manualAzimuth/_manualPolar accumulators below.
          const controls = this.inspection.controls
          const offset = this.camera.position.clone().sub(controls.target)
          orbitOffset(offset, azimuthDelta, polarDelta)
          this.camera.position.copy(controls.target).add(offset)
        } else {
          this._manualAzimuth += azimuthDelta
          this._manualPolar += polarDelta
        }
      },
    })
    this.testRig = new PhaseTestRig({ flowStore }) // TEMP: test rig — remove before ship

    this.mode = 'flow'
    this._unsubscribeFlow = flowStore.subscribe(() => {
      const state = flowStore.getSnapshot()
      if (state.mode !== this.mode) {
        const previousMode = this.mode
        this.mode = state.mode
        if (previousMode === 'inspect' && state.mode === 'flow') {
          this._reengageCameraFromInspect()
        } else if (state.mode === 'inspect') {
          const focus = this.inspection.getFocusWorldPosition()
          const camPos = focus.clone().addScaledVector(INSPECT_CAMERA_OFFSET, this.inspection.getFramingScale())
          this.camera.position.copy(camPos)
          this.camera.lookAt(focus)
          this._camPos.copy(camPos)
          this._camTarget.copy(focus)
        }
      }
      if (state.flow.phase !== this.currentPhase) this.setPhase(state.flow.phase)
    })

    this._frameId = null
    this._disposed = false
    this._animate = this._animate.bind(this)
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)

    if (import.meta.env.DEV) window.__apollo = this // TEMP: debug handle for test tooling
  }

  async init() {
    const { rocket, stageGroups } = await buildRocketStack()
    if (this._disposed) return

    this.rocket = rocket
    this.stageGroups = stageGroups
    this.scene.add(this.rocket)

    this.inspection = new InspectionController({
      camera: this.camera,
      renderer: this.renderer,
      rocket: this.rocket,
      stageGroups: this.stageGroups,
      labelContainer: this._labelContainer,
      flowStore: this.flowStore,
    })

    // S-IC exhaust anchors to its stage group so the plume rises with the
    // rocket; the smoke/steam field anchors to the scene at the pad so the
    // cloud billows where it belongs instead of riding along.
    const sicStage = this.stageGroups.get('S-IC')
    const engineOffsetY = sicStage ? -(sicStage.userData.bodyLength ?? 0) / 2 : 0
    this.exhaust = new ExhaustSystem(
      sicStage ?? this.rocket,
      engineOffsetY,
      EXHAUST_PRESETS.F1_CLUSTER,
      { smokeAnchor: this.scene, smokeOrigin: [0, 0, 0] },
    )

    this.launchSequence = new LaunchSequence({
      flowStore: this.flowStore,
      rocket: this.rocket,
      exhaustSystem: this.exhaust,
      skyEnvironment: this.sky,
    })
    this.testRig.setLaunchSequence(this.launchSequence) // TEMP: test rig — remove before ship

    this.choreography = new StagingChoreography({
      flowStore: this.flowStore,
      sceneManager: this,
      scene: this.scene,
      rocket: this.rocket,
      stageGroups: this.stageGroups,
      launchSequence: this.launchSequence,
      sicExhaust: this.exhaust,
      skyEnvironment: this.sky,
      launchPad: this.launchPad,
      earth: this.earth,
      moon: this.moon,
      ocean: this.ocean,
      keyLight: this.keyLight,
    })
    this.inspection.setChoreography(this.choreography)
  }

  start() {
    if (this._disposed) return
    this._animate()
  }

  // Kicks off a blend from the camera's CURRENT resolved pose to the target
  // phase's pose. Never set camera.position/lookAt directly elsewhere —
  // always route phase-driven moves through here so they go through
  // cameraPath.js.
  setPhase(phase) {
    if (phase === this.currentPhase) return
    const oldPose = getCameraPose(this.currentPhase)
    const toPose = getCameraPose(phase)

    // Snapshot where the camera is right now, so mid-transition phase
    // changes blend instead of popping. When both shots track the rocket,
    // capture the snapshot as OFFSETS from the old focus point — a static
    // world snapshot would fall behind the accelerating vehicle and let it
    // fly out of frame mid-blend.
    let from
    if (oldPose.frame === 'rocket' && toPose.frame === 'rocket' && this.rocket) {
      const focus = new THREE.Vector3(0, oldPose.focusHeight ?? 0, 0)
        .applyQuaternion(this.rocket.quaternion)
        .add(this.rocket.position)
      from = {
        frame: 'rocket',
        focusHeight: oldPose.focusHeight ?? 0,
        position: this._camPos.clone().sub(focus).toArray(),
        target: this._camTarget.clone().sub(focus).toArray(),
        shake: oldPose.shake ?? 0,
      }
    } else {
      from = {
        position: this._camPos.toArray(),
        target: this._camTarget.toArray(),
        shake: oldPose.shake ?? 0,
      }
    }

    // Each phase's slow orbit (and any free-look the user dialed in) starts
    // fresh; the captured offsets above already include whatever rotation
    // the old phase had accumulated.
    this._autoOrbitAngle = 0
    this._manualAzimuth = 0
    this._manualPolar = 0
    this._cameraTransition = {
      from,
      to: toPose,
      start: performance.now(),
      duration: toPose.duration ?? DEFAULT_TRANSITION_DURATION,
    }
    this.currentPhase = phase
  }

  // Choreography hook: 0 = engines out (shake dies), 1 = full burn. Smoothed
  // here so cutoffs decay rather than snapping.
  setShakeGain(gain) {
    this._shakeGainTarget = gain
  }

  _reengageCameraFromInspect() {
    // OrbitControls left the camera wherever the user dragged it; glide back
    // to the current phase's framing instead of teleporting.
    const orbitTarget = this.inspection?.controls.target
    this._camPos.copy(this.camera.position)
    if (orbitTarget) this._camTarget.copy(orbitTarget)
    const toPose = getCameraPose(this.currentPhase)
    this._cameraTransition = {
      from: {
        position: this._camPos.toArray(),
        target: this._camTarget.toArray(),
        shake: 0,
      },
      to: toPose,
      start: performance.now(),
      duration: toPose.duration ?? DEFAULT_TRANSITION_DURATION,
    }
  }

  _updateCamera(dt) {
    const now = performance.now()
    const currentPose = getCameraPose(this.currentPhase)
    this._autoOrbitAngle += (currentPose.orbitSpeed ?? 0) * dt
    const orbit = { azimuth: this._autoOrbitAngle + this._manualAzimuth, polar: this._manualPolar }

    let shakeAmp = (currentPose.shake ?? 0)
    const transition = this._cameraTransition
    if (transition) {
      const t = Math.min((now - transition.start) / transition.duration, 1)
      const eased = easeInOutCubic(t)
      resolvePoseWorld(
        transition.from,
        this.rocket,
        orbit,
        this._poseFromPos,
        this._poseFromTarget,
      )
      resolvePoseWorld(
        transition.to,
        this.rocket,
        orbit,
        this._poseToPos,
        this._poseToTarget,
      )
      this._poseToPos.lerpVectors(this._poseFromPos, this._poseToPos, eased)
      this._poseToTarget.lerpVectors(this._poseFromTarget, this._poseToTarget, eased)
      shakeAmp = THREE.MathUtils.lerp(
        transition.from.shake ?? 0,
        transition.to.shake ?? 0,
        eased,
      )
      if (t >= 1) this._cameraTransition = null
    } else {
      resolvePoseWorld(
        currentPose,
        this.rocket,
        orbit,
        this._poseToPos,
        this._poseToTarget,
      )
    }

    // Smoothed chase: the camera trails its resolved pose slightly, so
    // vehicle accelerations read as in-frame motion.
    const k = 1 - Math.exp(-dt * CAMERA_FOLLOW_LAMBDA)
    this._camPos.lerp(this._poseToPos, k)
    this._camTarget.lerp(this._poseToTarget, k)

    // Data-driven shake (pose amplitude x choreography gain), layered sines.
    this._shakeGain +=
      (this._shakeGainTarget - this._shakeGain) * (1 - Math.exp(-dt * SHAKE_GAIN_LAMBDA))
    this._shakeTime += dt
    const amp = shakeAmp * this._shakeGain
    const st = this._shakeTime
    const sx = amp * (Math.sin(st * 39.7) * 0.55 + Math.sin(st * 22.3) * 0.45)
    const sy = amp * (Math.sin(st * 33.1 + 1.3) * 0.6 + Math.sin(st * 47.9) * 0.4)
    const sz = amp * (Math.sin(st * 28.7 + 2.9) * 0.5 + Math.sin(st * 51.3) * 0.5)

    this.camera.position.set(this._camPos.x + sx, this._camPos.y + sy, this._camPos.z + sz)
    this.camera.lookAt(
      this._camTarget.x + sx * 0.35,
      this._camTarget.y + sy * 0.35,
      this._camTarget.z + sz * 0.35,
    )
  }

  _animate() {
    this._frameId = requestAnimationFrame(this._animate)

    const now = performance.now()
    const dt = Math.min((now - (this._lastFrameMs ?? now)) / 1000, 0.1)
    this._lastFrameMs = now

    // Stage explode/collapse tweens always advance; OrbitControls/labels
    // inside only activate while inspect mode is on.
    this.inspection?.update()

    // Vehicle motion first, then the camera, so framing uses this frame's
    // rocket transform.
    this.launchSequence?.update(now)
    this.choreography?.update(dt)
    if (this.mode !== 'inspect') this._updateCamera(dt)

    this.exhaust?.update(dt)
    this.sky.followCamera(this.camera.position)

    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const { clientWidth, clientHeight } = this.container
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight)
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true

    cancelAnimationFrame(this._frameId)
    window.removeEventListener('resize', this._onResize)
    this._unsubscribeFlow()
    this.inspection?.dispose()
    this.launchSequence?.dispose()
    this.choreography?.dispose()
    this.spaceStepper.dispose()
    this.freeLook.dispose()
    this.testRig.dispose() // TEMP: test rig — remove before ship
    this._labelContainer.remove()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
