import { useEffect, useState } from 'react'
import './ScrollCue.css'

// Bottom-center invitation to keep going — the hero has no content of its
// own to point at beyond "the mission plays itself," so this is the entire
// affordance for discovering that a real site lives underneath it. Fades
// out as soon as the user starts scrolling so it never overlaps HeroIntro.
function ScrollCue() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY < 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollDown = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      className={`scroll-cue${visible ? '' : ' scroll-cue--hidden'}`}
      onClick={scrollDown}
      aria-label="Scroll to explore the Apollo program"
    >
      <span className="scroll-cue-label">Explore the program</span>
      <span className="scroll-cue-chevron" aria-hidden="true" />
    </button>
  )
}

export default ScrollCue
