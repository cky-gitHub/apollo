import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/site/PageHeader.jsx'
import { getMissionBySlug } from '../data/missions.js'
import '../App.css'
import './MissionDetailPage.css'

function MissionDetailPage() {
  const { missionId } = useParams()
  const mission = getMissionBySlug(missionId)

  if (!mission) {
    return (
      <main className="page">
        <div className="container" style={{ padding: '7rem 0', textAlign: 'center' }}>
          <p className="eyebrow">Not found</p>
          <h1 className="section-heading">No mission by that name.</h1>
          <p className="lede" style={{ margin: '1.25rem auto 2rem' }}>
            <Link to="/missions">Back to the mission index →</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <PageHeader eyebrow={`${mission.tag} · ${mission.dates}`} title={mission.designation} />

      <section className="container mission-detail">
        <div className="mission-detail-main">
          <p className="body-copy">{mission.summary}</p>

          {mission.slug === 'apollo-11' && (
            <Link to="/apollo-11" className="mission-detail-deepdive">
              Read the full Apollo 11 deep dive →
            </Link>
          )}

          {mission.slug !== 'apollo-11' && (
            <p className="mission-detail-stub-note">
              This mission's full retrospective — hour-by-hour timeline, imagery, mission audio — is
              coming soon. This page is a placeholder scaffold.
            </p>
          )}
        </div>

        <aside className="mission-detail-facts">
          <dl>
            <div>
              <dt>Dates</dt>
              <dd>{mission.dates}</dd>
            </div>
            {mission.durationDays && (
              <div>
                <dt>Duration</dt>
                <dd>{mission.durationDays} days</dd>
              </div>
            )}
            {mission.landingSite && (
              <div>
                <dt>Landing site</dt>
                <dd>{mission.landingSite}</dd>
              </div>
            )}
            <div>
              <dt>Crew</dt>
              <dd>
                <ul className="mission-detail-crew">
                  {mission.crew.map((member) => (
                    <li key={member.name}>
                      {member.name} <span>· {member.role}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  )
}

export default MissionDetailPage
