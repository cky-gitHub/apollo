import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import './Nav.css'

// The cky logo (top left) is the way back to ckyogeshwar.com; these are
// Apollo's own pages. 'Simulation' is the flight on the Apollo home page.
const LINKS = [
  { to: '/', label: 'Simulation', end: true },
  { to: '/program', label: 'The program' },
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
        {/* The mark is the cky logo, so it goes home to ckyogeshwar.com. A
            plain anchor: a router link to "/" would stay inside /apollo. */}
        <a href="/" className="site-nav-mark" aria-label="cky — home">
          <span className="site-nav-logo" aria-hidden="true" />
        </a>

        {/* The full name beside the mark, as on every ckyogeshwar.com page.
            It goes home too; the logo is the keyboard stop, so this is not. */}
        <a href="/" className="site-nav-wordmark" tabIndex={-1}>
          Constantin K Yogeshwar
        </a>

        <nav className="site-nav-links" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `site-nav-link${isActive ? ' site-nav-link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
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
              end={link.end}
              className={({ isActive }) => `site-nav-link${isActive ? ' site-nav-link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

export default Nav
