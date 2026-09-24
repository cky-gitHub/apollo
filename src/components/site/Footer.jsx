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

          {/* Plain anchors, not router links: these leave this app for the
              main site it is mounted in. */}
          <nav className="site-footer-links" aria-label="Legal">
            <a href="/">ckyogeshwar.com</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </div>

        <div className="site-footer-attribution">
          <p>
            Earth imagery: NASA Blue Marble (public domain). Moon imagery: NASA SVS CGI Moon Kit,
            LROC color map (public domain). Mission telemetry and timeline data adapted from the NASA
            Apollo 11 Flight Journal. 3D models, both{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener">
              CC BY 4.0
            </a>
            , optimised for the web:{' '}
            <a
              href="https://sketchfab.com/3d-models/apollo-saturn-v-launch-vehicle-7c61146069134981a84dc7ed951609a0"
              target="_blank"
              rel="noreferrer noopener"
            >
              Apollo | Saturn V Launch Vehicle
            </a>{' '}
            by devPilot;{' '}
            <a
              href="https://sketchfab.com/3d-models/apollo-spacecraft-block-2-release-2012-dec-31-fdcae17bbfa04101b86e4ce920367982"
              target="_blank"
              rel="noreferrer noopener"
            >
              Apollo Spacecraft, Block 2
            </a>{' '}
            by 3dpilgrim. Neither author endorses this site.
          </p>
          <p className="site-footer-copyright">
            © {new Date().getFullYear()} Constantin Yogeshwar. Not affiliated with or endorsed by NASA.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
