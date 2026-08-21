import PageHeader from '../components/site/PageHeader.jsx'
import '../App.css'
import './ProgramPage.css'

const STAGES = [
  {
    name: 'S-IC',
    role: 'First stage',
    detail: '5× F-1 engines burning RP-1/LOX, 34 MN of thrust, burns for about 2.5 minutes to ~68 km altitude.',
  },
  {
    name: 'S-II',
    role: 'Second stage',
    detail: '5× J-2 engines burning LH2/LOX, carries the stack most of the way to orbital velocity.',
  },
  {
    name: 'S-IVB',
    role: 'Third stage',
    detail: 'Single restartable J-2 — one burn completes orbit insertion, a second performs trans-lunar injection.',
  },
]

function ProgramPage() {
  return (
    <main className="page">
      <PageHeader
        eyebrow="1961 – 1972"
        title="The Apollo Program"
        lede="A nine-year, seventeen-mission effort to land Americans on the Moon and return them safely — driven by Cold War urgency, built on Mercury and Gemini, and flown on the largest rocket ever to carry a crew."
      />

      <section className="container program-section">
        <p className="eyebrow">Origins</p>
        <h2 className="section-heading">A deadline set before the hardware existed</h2>
        <div className="body-copy">
          <p>
            On May 25, 1961 — three weeks after Alan Shepard became the first American in space, and
            barely a month after Yuri Gagarin became the first human in orbit — President John F.
            Kennedy told a joint session of Congress that the United States should commit to "landing a
            man on the Moon and returning him safely to the Earth" before the decade was out. At the
            time, NASA had a total of fifteen minutes of crewed spaceflight experience and no rocket
            capable of leaving Earth orbit.
          </p>
          <p>
            Apollo followed two earlier programs built specifically to close that gap: Mercury (1961–63)
            proved a human could survive and work in orbit; Gemini (1965–66) rehearsed the rendezvous,
            docking, and long-duration spaceflight skills a lunar mission would require. Apollo itself
            flew seventeen missions — three uncrewed Saturn V test flights, a ground-test tragedy that
            killed the Apollo 1 crew and delayed the program 21 months, and eleven crewed flights,
            six of which landed on the Moon.
          </p>
        </div>
      </section>

      <section className="container program-section">
        <p className="eyebrow">The vehicle</p>
        <h2 className="section-heading">Saturn V</h2>
        <div className="body-copy">
          <p>
            Designed under Wernher von Braun at the Marshall Space Flight Center, the Saturn V stood
            111 meters tall and generated 34 meganewtons (7.5 million lbf) of thrust at liftoff. It flew
            thirteen times, in configurations depicted throughout this site's mission animation, without
            a single catastrophic launch failure. It remains the only rocket ever to have carried humans
            beyond low Earth orbit.
          </p>
        </div>

        <div className="stage-grid">
          {STAGES.map((stage) => (
            <div key={stage.name} className="stage-card">
              <span className="eyebrow">{stage.role}</span>
              <h3>{stage.name}</h3>
              <p>{stage.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container program-section">
        <p className="eyebrow">Mission architecture</p>
        <h2 className="section-heading">Lunar orbit rendezvous</h2>
        <div className="body-copy">
          <p>
            The hardest engineering argument of the whole program wasn't the rocket — it was how to get
            to the surface and back. NASA weighed three approaches: <strong>direct ascent</strong> (one
            giant spacecraft flies straight to the Moon and back, requiring an even larger rocket than
            the Saturn V), <strong>Earth orbit rendezvous</strong> (assemble a lunar craft from multiple
            launches in Earth orbit), and <strong>lunar orbit rendezvous</strong> — send one combined
            spacecraft to the Moon, split it in lunar orbit, land only the small piece, and rejoin before
            coming home.
          </p>
          <p>
            Lunar orbit rendezvous was the least intuitive option and initially the least favored — it
            meant a docking maneuver would have to succeed a quarter of a million miles from Earth, with
            no possibility of rescue if it failed. Engineer John Houbolt championed it against internal
            resistance for two years, arguing (correctly) that the mass savings from landing only the
            Lunar Module, rather than the entire Command/Service Module stack, were the only way to make
            Kennedy's deadline achievable on a single Saturn V launch. NASA adopted it in 1962. Every
            Apollo landing — including the one animated on this site's hero page — flew this profile.
          </p>
        </div>
      </section>

      <section className="container program-section program-section--last">
        <p className="eyebrow">Legacy</p>
        <h2 className="section-heading">What Apollo left behind</h2>
        <div className="body-copy">
          <p>
            Six landings returned 382 kg of lunar samples and left seismometers, laser reflectors, and
            heat-flow instruments that continued returning data for years after the astronauts left.
            Apollo 17, in December 1972, was the last time a human being stood on another world. Budget
            cuts cancelled Apollo 18, 19, and 20 before they flew.
          </p>
          <p>
            The program's hardware and institutional knowledge fed directly into Skylab and the Space
            Shuttle; its ambitions are the explicit reference point for NASA's current Artemis program,
            which aims to return crewed missions to the lunar surface for the first time since 1972.
          </p>
        </div>
      </section>
    </main>
  )
}

export default ProgramPage
