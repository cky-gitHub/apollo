import { useCallback, useEffect, useRef, useState } from 'react'
import { SceneManager } from '../scene/SceneManager'
import { FlowStore } from '../scene/flowState.js'
import Hud from '../hud/Hud.jsx'
import ScrollCue from '../components/site/ScrollCue.jsx'
import HeroIntro from '../components/site/HeroIntro.jsx'
import './HeroPage.css'

// The flight itself: canvas, scene and HUD, owning one FlowStore. HeroPage
// remounts it under a new key to start over ("Fly again" after splashdown),
// which disposes the old SceneManager and builds a fresh one on the pad —
// the same state as first landing on the Apollo home page, no page reload.
function HeroStage({ spacerRef, onRestart }) {
  const canvasRootRef = useRef(null)
  const sceneManagerRef = useRef(null)
  const [flowStore] = useState(() => new FlowStore())
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    const container = canvasRootRef.current
    const sceneManager = new SceneManager(container, flowStore)
    sceneManagerRef.current = sceneManager
    let disposed = false

    sceneManager.init().then(() => {
      if (disposed) {
        sceneManager.dispose()
        return
      }
      sceneManager.start()
      setSceneReady(true)
    })

    // Idle the render loop once the fixed hero has scrolled fully out of
    // view behind the content below — the mission keeps running, it just
    // isn't burning frames nobody sees. See SceneManager.setPaused.
    const spacer = spacerRef.current
    const observer = new IntersectionObserver(
      ([entry]) => sceneManager.setPaused(!entry.isIntersecting),
      { threshold: 0 },
    )
    if (spacer) observer.observe(spacer)

    return () => {
      disposed = true
      sceneManagerRef.current = null
      setSceneReady(false)
      observer.disconnect()
      sceneManager.dispose()
    }
  }, [flowStore, spacerRef])

  return (
    <div className="hero-fixed">
      <div ref={canvasRootRef} className="hero-canvas-root" />
      <Hud
        flowStore={flowStore}
        ready={sceneReady}
        onLaunch={() => sceneManagerRef.current?.launch()}
        onRestart={onRestart}
      />
      <ScrollCue />
    </div>
  )
}

function HeroPage() {
  const spacerRef = useRef(null)
  const [run, setRun] = useState(0)

  const restart = useCallback(() => {
    window.scrollTo({ top: 0 })
    setRun((n) => n + 1)
  }, [])

  return (
    <div className="hero-page">
      <HeroStage key={run} spacerRef={spacerRef} onRestart={restart} />
      <div ref={spacerRef} className="hero-spacer" aria-hidden="true" />
      <HeroIntro />
    </div>
  )
}

export default HeroPage
