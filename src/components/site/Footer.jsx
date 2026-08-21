import { Link } from 'react-router-dom'
import './Footer.css'

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-row">
          <div className="site-footer-brand">
            <span className="site-footer-mark">APOLLO</span>
            <p className="site-footer-tagline">
              An independent, unofficial retelling of the Apollo program — not affiliated with NASA.
            </p>
          </div>

          <nav className="site-footer-links" aria-label="Site">
            <Link to="/program">The Program</Link>
            <Link to="/apollo-11">Apollo 11</Link>
            <Link to="/missions">Missions</Link>
            <Link to="/about">About</Link>
          </nav>

          <nav className="site-footer-links" aria-label="Legal">
            <Link to="/legal/impressum">Impressum</Link>
            <Link to="/legal/privacy">Privacy</Link>
          </nav>
        </div>

        <div className="site-footer-attribution">
          <p>
            Earth imagery: NASA Blue Marble (public domain). Moon imagery: NASA SVS CGI Moon Kit,
            LROC color map (public domain). Mission telemetry and timeline data adapted from the NASA
            Apollo 11 Flight Journal. Saturn V and Lunar Module 3D models: [PLACEHOLDER — confirm and
            credit the exact source/license of the model files before publishing].
          </p>
          <p className="site-footer-copyright">© {new Date().getFullYear()} Apollo project. Not affiliated with or endorsed by NASA.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
