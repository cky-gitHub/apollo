import PageHeader from '../components/site/PageHeader.jsx'
import '../App.css'

function AboutPage() {
  return (
    <main className="page">
      <PageHeader
        eyebrow="About this project"
        title="Why build a Saturn V in a browser"
        lede="A short note on the intent behind this site, and the person who made it — replace this copy with your own."
      />

      <section className="container" style={{ padding: '3.5rem 0 5rem' }}>
        <div className="body-copy">
          <p>
            This site started as an attempt to answer a narrow question: could the choreography of a
            Saturn V launch — ignition, staging, translunar injection, a lunar landing, the long fall
            back to the Pacific — be rebuilt accurately enough, in real time, in a browser, that it felt
            like flight rather than animation? The 3D sequence on the landing page is that attempt. Every
            stage separation, every camera move, and most of the numbers on the instrument overlay are
            tied to the real Apollo 11 timeline, not tuned for effect.
          </p>
          <p>
            The rest of the site grew out of the same instinct that built the animation: the Apollo
            program is one of the best-documented engineering efforts in history, and most of that
            documentation is scattered across NASA PDFs, mission transcripts, and decades-old press
            kits. This is an attempt to put a clean, accurate, readable version of that story in one
            place — the program as a whole, the mission the animation depicts in detail, and a full
            roster of the eleven crewed flights that got us there and back.
          </p>
          <p>
            This project was designed and built by Constantin Yogeshwar, as part of{' '}
            <a href="/">ckyogeshwar.com</a>. It is an independent, unofficial project and is not
            affiliated with, endorsed by, or sponsored by NASA. Corrections, source citations, and
            technical notes are welcome — see the <a href="/about#contact">contact details</a>.
          </p>
        </div>
      </section>
    </main>
  )
}

export default AboutPage
