import { useEffect, useRef, useState } from 'react'
import { SceneManager } from './scene/SceneManager'
import { FlowStore } from './scene/flowState.js'
import Hud from './hud/Hud.jsx'
import './App.css'

function App() {
  const canvasRootRef = useRef(null)
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

    return () => {
      disposed = true
      sceneManager.dispose()
    }
  }, [flowStore])

  return (
    <div className="app-root">
      <div ref={canvasRootRef} className="canvas-root" />
      <Hud flowStore={flowStore} />
    </div>
  )
}

export default App
