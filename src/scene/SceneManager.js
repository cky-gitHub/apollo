import * as THREE from 'three'
import { buildRocketStack } from './rocket/RocketAssembly.js'
import { getCameraPose, interpolatePose } from './cameraPath.js'
import { InspectionController } from './inspection.js'
import { ScrollStepper } from './scrollStepper.js'
import { PhaseTestRig } from './phaseTestRig.js' // TEMP: test rig — remove before ship

const CAMERA_TRANSITION_DURATION = 1200 // ms

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export class SceneManager {
  constructor(container, flowStore) {
    this.container = container
    this.flowStore = flowStore

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      10000,
    )

    this.currentPhase = 0
    this._cameraTransition = null
    const initialPose = getCameraPose(this.currentPhase)
    this.camera.position.set(...initialPose.position)
    this.camera.lookAt(...initialPose.target)

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

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        color: 0x1b1b1f,
        metalness: 0.1,
        roughness: 0.9,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    this.rocket = null
    this.stageGroups = new Map()
    this.inspection = null

    this._labelContainer = document.createElement('div')
    this._labelContainer.style.position = 'absolute'
    this._labelContainer.style.inset = '0'
    this._labelContainer.style.pointerEvents = 'none'
    this._labelContainer.style.display = 'none'
    container.appendChild(this._labelContainer)

    this.scrollStepper = new ScrollStepper({ flowStore })
    this.testRig = new PhaseTestRig({ flowStore }) // TEMP: test rig — remove before ship

    this.mode = 'flow'
    this._unsubscribeFlow = flowStore.subscribe(() => {
      const state = flowStore.getSnapshot()
      this.mode = state.mode
      if (state.flow.phase !== this.currentPhase) this.setPhase(state.flow.phase)
    })

    this._frameId = null
    this._disposed = false
    this._animate = this._animate.bind(this)
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
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
  }

  start() {
    if (this._disposed) return
    this._animate()
  }

  // Kicks off a lerp from the current camera pose to the target phase's
  // pose. Never set camera.position/lookAt directly elsewhere — always
  // route phase-driven moves through here so they go through cameraPath.js.
  setPhase(phase) {
    if (phase === this.currentPhase) return
    this._cameraTransition = {
      from: getCameraPose(this.currentPhase),
      to: getCameraPose(phase),
      start: performance.now(),
    }
    this.currentPhase = phase
  }

  _updateCameraTransition() {
    const transition = this._cameraTransition
    if (!transition) return

    const elapsed = performance.now() - transition.start
    const t = Math.min(elapsed / CAMERA_TRANSITION_DURATION, 1)
    const pose = interpolatePose(transition.from, transition.to, easeInOutCubic(t))

    this.camera.position.copy(pose.position)
    this.camera.lookAt(pose.target)

    if (t >= 1) this._cameraTransition = null
  }

  _animate() {
    this._frameId = requestAnimationFrame(this._animate)

    // Stage explode/collapse tweens always advance; OrbitControls/labels
    // inside only activate while inspect mode is on.
    this.inspection?.update()
    if (this.mode !== 'inspect') this._updateCameraTransition()

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
    this.scrollStepper.dispose()
    this.testRig.dispose() // TEMP: test rig — remove before ship
    this._labelContainer.remove()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
