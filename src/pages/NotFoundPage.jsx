import { Link } from 'react-router-dom'
import '../App.css'

function NotFoundPage() {
  return (
    <main className="page">
      <div className="container" style={{ padding: '7rem 0', textAlign: 'center' }}>
        <p className="eyebrow">404</p>
        <h1 className="section-heading">This orbit doesn’t exist.</h1>
        <p className="lede" style={{ margin: '1.25rem auto 2rem' }}>
          The page you’re looking for isn’t part of the mission plan.
        </p>
        <Link to="/" className="site-nav-link" style={{ color: 'var(--site-accent-text)' }}>
          Return to the hero →
        </Link>
      </div>
    </main>
  )
}

export default NotFoundPage
