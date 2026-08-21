import { Link } from 'react-router-dom'
import './HeroIntro.css'

const ENTRY_LINKS = [
  {
    to: '/program',
    kicker: 'Overview',
    title: 'The Apollo Program',
    body: 'Nine years, seventeen missions, one goal set by a president who would not live to see it met.',
  },
  {
    to: '/apollo-11',
    kicker: 'Deep dive',
    title: 'Apollo 11',
    body: 'The mission this animation depicts, hour by hour — crew, spacecraft, and the eight days that ended in the Pacific.',
  },
  {
    to: '/missions',
    kicker: 'Index',
    title: 'Every Mission',
    body: 'From the Apollo 1 fire to the last bootprints on the Ocean of Storms — the full roster.',
  },
]

function HeroIntro() {
  return (
    <section className="hero-intro">
      <div className="hero-intro-inner">
        <p className="eyebrow">You just watched Apollo 11 fly, unattended, start to finish</p>
        <h2 className="hero-intro-heading">This is a site about how it really happened.</h2>
        <p className="lede">
          The animation above is a real-time reconstruction of the mission — the same staging events,
          the same trajectory, the same Ground Elapsed Time the astronauts flew by. Everything below it
          is the history behind the choreography.
        </p>

        <div className="hero-intro-grid">
          {ENTRY_LINKS.map((item) => (
            <Link key={item.to} to={item.to} className="hero-intro-card">
              <span className="eyebrow">{item.kicker}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="hero-intro-card-cta">Read more →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HeroIntro
