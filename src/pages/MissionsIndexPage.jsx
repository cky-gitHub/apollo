import { Link } from 'react-router-dom'
import PageHeader from '../components/site/PageHeader.jsx'
import { MISSIONS } from '../data/missions.js'
import '../App.css'
import './MissionsIndexPage.css'

function MissionsIndexPage() {
  const primary = MISSIONS.filter((mission) => mission.primary)
  const rest = MISSIONS.filter((mission) => !mission.primary)

  return (
    <main className="page">
      <PageHeader
        eyebrow="1967 – 1972"
        title="Every Mission"
        lede="The full crewed Apollo roster — from the Apollo 1 fire that nearly ended the program before it began, to the last bootprints on the Moon in 1972."
      />

      <section className="container missions-section">
        <p className="eyebrow">Defining moments</p>
        <div className="mission-grid mission-grid--primary">
          {primary.map((mission) => (
            <MissionCard key={mission.slug} mission={mission} featured />
          ))}
        </div>
      </section>

      <section className="container missions-section missions-section--last">
        <p className="eyebrow">The full roster</p>
        <div className="mission-grid">
          {rest.map((mission) => (
            <MissionCard key={mission.slug} mission={mission} />
          ))}
        </div>
        <p className="missions-footnote">
          Uncrewed Saturn V test flights (Apollo 4–6) and the cancelled Apollo 18–20 aren't listed
          individually — see <Link to="/program">The Apollo Program</Link> for the full picture.
        </p>
      </section>
    </main>
  )
}

function MissionCard({ mission, featured }) {
  return (
    <Link to={`/missions/${mission.slug}`} className={`mission-card${featured ? ' mission-card--featured' : ''}`}>
      <div className="mission-card-top">
        <h3>{mission.designation}</h3>
        <span className="eyebrow">{mission.dates}</span>
      </div>
      <p className="mission-card-tag">{mission.tag}</p>
      <p className="mission-card-summary">{mission.summary}</p>
      <span className="mission-card-cta">View mission →</span>
    </Link>
  )
}

export default MissionsIndexPage
