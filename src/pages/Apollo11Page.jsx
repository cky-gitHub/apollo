import PageHeader from '../components/site/PageHeader.jsx'
import RocketViewer from '../components/site/RocketViewer.jsx'
import '../App.css'
import './Apollo11Page.css'

const CREW = [
  {
    name: 'Neil Armstrong',
    role: 'Commander',
    bio: 'A Navy combat pilot and civilian test pilot before joining NASA in 1962, Armstrong flew Gemini 8 (the first docking in space, and the first in-flight abort of a crewed U.S. mission) before commanding Apollo 11. He was the first human to set foot on another world.',
  },
  {
    name: 'Michael Collins',
    role: 'Command Module Pilot',
    bio: 'A veteran of Gemini 10, Collins flew Columbia alone in lunar orbit for 21.5 hours while Armstrong and Aldrin were on the surface — including 48 minutes of every orbit spent on the far side of the Moon, with no radio contact with Earth or his crewmates.',
  },
  {
    name: 'Buzz Aldrin',
    role: 'Lunar Module Pilot',
    bio: 'An MIT-trained orbital mechanics specialist and Gemini 12 veteran, Aldrin developed much of the rendezvous and docking technique Apollo relied on. He followed Armstrong onto the surface nineteen minutes later.',
  },
]

const TIMELINE = [
  { get: '000:00:00', date: 'Jul 16, 1969', title: 'Launch', body: 'Saturn V lifts off from Pad 39A, Kennedy Space Center, 09:32 EDT.' },
  { get: '003:24:00', date: 'Jul 16', title: 'Transposition & docking', body: 'Columbia separates, turns, and docks with Eagle to extract it from the S-IVB.' },
  { get: '075:50:00', date: 'Jul 19', title: 'Lunar orbit insertion', body: 'The SPS engine brakes the stack into orbit 100 km above the Moon.' },
  { get: '102:45:40', date: 'Jul 20', title: 'Powered descent — touchdown', body: 'Eagle lands in the Sea of Tranquility with roughly 25 seconds of descent fuel remaining.' },
  { get: '109:24:15', date: 'Jul 20', title: '"That\'s one small step..."', body: 'Armstrong steps onto the surface; Aldrin follows nineteen minutes later.' },
  { get: '124:22:00', date: 'Jul 21', title: 'Ascent', body: 'Eagle\'s ascent stage lifts off, leaving the descent stage behind as a launch platform.' },
  { get: '128:03:00', date: 'Jul 21', title: 'Docking with Columbia', body: 'Eagle rendezvous and redocks with Columbia in lunar orbit; the crew transfers back and jettisons Eagle.' },
  { get: '135:23:42', date: 'Jul 22', title: 'Trans-Earth injection', body: 'A final SPS burn breaks lunar orbit and sends Columbia home.' },
  { get: '195:18:35', date: 'Jul 24', title: 'Splashdown', body: 'Columbia reenters at roughly 39,700 km/h and splashes down in the Pacific, 2,660 km east of Wake Island.' },
]

function Apollo11Page() {
  return (
    <main className="page">
      <PageHeader
        eyebrow="Jul 16 – 24, 1969 · Sea of Tranquility"
        title="Apollo 11"
        lede="The mission this site's animation depicts, in the detail the hero sequence doesn't have room for — the crew, the hour-by-hour timeline, the landing, and the trip home."
      />

      <section className="container apollo11-split">
        <div className="apollo11-viewer-col">
          <RocketViewer />
        </div>

        <div className="apollo11-crew-col">
          <p className="eyebrow">The crew</p>
          <h2 className="section-heading">Three men, one seat empty</h2>
          <p className="body-copy" style={{ marginBottom: '2rem' }}>
            Only two of the three would walk on the Moon. Command Module Pilot Michael Collins flew the
            mission alone in lunar orbit — by his own account the loneliest job in the history of
            exploration, and, for 48 minutes of every orbit, the most isolated a human being had ever
            been.
          </p>

          {CREW.map((member) => (
            <article key={member.name} className="crew-card">
              <div className="crew-card-header">
                <h3>{member.name}</h3>
                <span className="eyebrow">{member.role}</span>
              </div>
              <p>{member.bio}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container apollo11-section">
        <p className="eyebrow">Timeline</p>
        <h2 className="section-heading">Eight days, Ground Elapsed Time</h2>
        <p className="body-copy" style={{ marginBottom: '2.5rem' }}>
          NASA tracked the mission in Ground Elapsed Time (GET) — hours:minutes:seconds since liftoff,
          the same clock the hero animation's instrument overlay counts up. These are the anchors it
          spools between.
        </p>

        <ol className="mission-timeline">
          {TIMELINE.map((event) => (
            <li key={event.get} className="mission-timeline-item">
              <div className="mission-timeline-get">
                <span>{event.get}</span>
                <span className="mission-timeline-date">{event.date}</span>
              </div>
              <div className="mission-timeline-body">
                <h3>{event.title}</h3>
                <p>{event.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="container apollo11-section">
        <p className="eyebrow">The landing</p>
        <h2 className="section-heading">"The Eagle has landed"</h2>
        <div className="body-copy">
          <p>
            The descent nearly didn't happen the way it's remembered. Twice during the final approach,
            Eagle's guidance computer threw 1202 and 1201 "program alarms" — it was being fed more data
            than it could process in real time. Guidance officer Steve Bales, backed by 26-year-old
            programmer Jack Garman in the back room, made the call in seconds: the alarms meant the
            computer was shedding low-priority tasks and recovering, not failing. Landing was a go.
          </p>
          <p>
            Then Armstrong saw where the computer was taking them — a boulder field around a crater the
            size of a football stadium. He took semi-manual control, flew Eagle horizontally past it
            looking for clear ground, and set down in the Sea of Tranquility with, by later analysis,
            about 25 seconds of descent fuel left before an abort would have been mandatory. "Houston,
            Tranquility Base here. The Eagle has landed."
          </p>
          <p>
            Armstrong and Aldrin spent 21.6 hours on the surface, including a 2.5-hour moonwalk. They
            deployed a seismometer and a laser retroreflector array still in use today, planted a flag
            rigged with a horizontal rod (there is no wind on the Moon to unfurl it), took a call from
            President Nixon, and collected 21.5 kg of rock and soil samples.
          </p>
        </div>
      </section>

      <section className="container apollo11-section apollo11-section--last">
        <p className="eyebrow">The return</p>
        <h2 className="section-heading">Getting home</h2>
        <div className="body-copy">
          <p>
            Eagle's ascent stage lifted off using the descent stage as a launch pad — left behind on the
            Moon, where it remains. Rendezvous and docking with Collins in Columbia went smoothly; Eagle
            was jettisoned into lunar orbit, and a final SPS burn broke Columbia free for the three-day
            fall back to Earth.
          </p>
          <p>
            Reentry hit the atmosphere at roughly 39,700 km/h — the fastest a crewed spacecraft had ever
            flown — before three parachutes brought Columbia down in the Pacific on July 24, 1969, near
            the recovery ship USS Hornet. The crew spent the next 21 days in quarantine, a precaution
            against the (ultimately nonexistent) risk of lunar contamination, before their first public
            appearance.
          </p>
        </div>
      </section>
    </main>
  )
}

export default Apollo11Page
