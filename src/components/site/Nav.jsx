import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import './Nav.css'

const LINKS = [
  { to: '/program', label: 'The Program' },
  { to: '/apollo-11', label: 'Apollo 11' },
  { to: '/missions', label: 'Missions' },
  { to: '/about', label: 'About' },
]

function Nav({ isHero }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (!isHero) return undefined
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHero])

  // Close the mobile menu on navigation, same reasoning as ScrollToTop.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const solid = !isHero || scrolled || menuOpen

  return (
    <header className={`site-nav${solid ? ' site-nav--solid' : ''}`}>
      <div className="site-nav-inner">
        <NavLink to="/" className="site-nav-mark" aria-label="Apollo — home">
          APOLLO
        </NavLink>

        <nav className="site-nav-links" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `site-nav-link${isActive ? ' site-nav-link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
          {/* Back out to the main site this app is mounted in. A plain
              anchor: the router's links stay inside /apollo. */}
          <a href="/" className="site-nav-link site-nav-home">
            ← cky
          </a>
        </nav>

        <button
          type="button"
          className={`site-nav-toggle${menuOpen ? ' site-nav-toggle--open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <nav className="site-nav-mobile" aria-label="Primary mobile">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `site-nav-link${isActive ? ' site-nav-link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
          {/* Back out to the main site this app is mounted in. A plain
              anchor: the router's links stay inside /apollo. */}
          <a href="/" className="site-nav-link site-nav-home">
            ← cky
          </a>
        </nav>
      )}
    </header>
  )
}

export default Nav
