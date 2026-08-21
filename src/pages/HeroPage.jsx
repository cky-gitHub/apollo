import { useEffect, useRef, useState } from 'react'
import { SceneManager } from '../scene/SceneManager'
import { FlowStore } from '../scene/flowState.js'
import Hud from '../hud/Hud.jsx'
import ScrollCue from '../components/site/ScrollCue.jsx'
import HeroIntro from '../components/site/HeroIntro.jsx'
import './HeroPage.css'

function HeroPage() {
  const canvasRootRef = useRef(null)
  const spacerRef = useRef(null)
  const [flowStore] = useState(() => new FlowStore())

  useEffect(() => {
    const container = canvasRootRef.current
    const sceneManager = new SceneManager(container, flowStore)
    let disposed = false

    sceneManager.init().then(() => {
      if (disposed) {
        sceneManager.dispose()
        return
      }
      sceneManager.start()
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
      observer.disconnect()
      sceneManager.dispose()
    }
  }, [flowStore])

  return (
    <div className="hero-page">
      <div className="hero-fixed">
        <div ref={canvasRootRef} className="hero-canvas-root" />
        <Hud flowStore={flowStore} />
        <ScrollCue />
      </div>
      <div ref={spacerRef} className="hero-spacer" aria-hidden="true" />
      <HeroIntro />
    </div>
  )
}

export default HeroPage
