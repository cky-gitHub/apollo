import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildRocketStack } from '../../scene/rocket/RocketAssembly.js'
import './RocketViewer.css'

// Standalone, lightweight reuse of the same GLB stack the hero mission
// flies — no flowStore, no choreography, no HUD. Just the model, framed and
// slowly turning, for a content page. Only mounts/loads while this
// component is on screen (the Apollo 11 page), and fully disposes its own
// renderer/scene on unmount so it never lingers once the user navigates
// away.
function RocketViewer() {
  const containerRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let disposed = false
    let frameId = null

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    )
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 3.2)
    keyLight.position.set(120, 180, 140)
    scene.add(keyLight)
    const fillLight = new THREE.HemisphereLight(0x9fb3d1, 0x2a2622, 0.65)
    scene.add(fillLight)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6

    buildRocketStack()
      .then(({ rocket }) => {
        if (disposed) return
        scene.add(rocket)

        const box = new THREE.Box3().setFromObject(rocket)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const radius = Math.max(size.length() * 0.5, 1)

        rocket.position.sub(center)

        // Distance needed for the bounding sphere to fit inside whichever
        // of the camera's two FOVs is more restrictive — the viewer panel
        // is roughly square/portrait, so the horizontal FOV (narrower,
        // derived from the vertical one via aspect) is usually the binding
        // constraint for this tall, thin stack, not the vertical one alone.
        const halfVFov = (camera.fov * Math.PI) / 360
        const halfHFov = Math.atan(Math.tan(halfVFov) * camera.aspect)
        const bindingHalfFov = Math.min(halfVFov, halfHFov)
        const fitDistance = (radius / Math.sin(bindingHalfFov)) * 1.25
        const direction = new THREE.Vector3(0.72, 0.22, 1).normalize()

        camera.near = radius * 0.01
        camera.far = radius * 20
        camera.position.copy(direction.multiplyScalar(fitDistance))
        camera.updateProjectionMatrix()
        controls.minDistance = radius * 0.3
        controls.maxDistance = fitDistance * 2.2
        controls.target.set(0, 0, 0)
        controls.update()

        setStatus('ready')
      })
      .catch((error) => {
        console.error('RocketViewer failed to load the Saturn V model.', error)
        if (!disposed) setStatus('error')
      })

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      scene.traverse((object) => {
        object.geometry?.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material?.dispose())
      })
    }
  }, [])

  return (
    <div className="rocket-viewer">
      <div ref={containerRef} className="rocket-viewer-canvas" />
      {status === 'loading' && <p className="rocket-viewer-status">Loading Saturn V model…</p>}
      {status === 'error' && (
        <p className="rocket-viewer-status rocket-viewer-status--error">Model failed to load.</p>
      )}
      {status === 'ready' && <p className="rocket-viewer-hint">Drag to rotate · scroll to zoom</p>}
    </div>
  )
}

export default RocketViewer
