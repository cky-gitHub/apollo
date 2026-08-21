import PageHeader from '../components/site/PageHeader.jsx'
import '../App.css'
import './LegalPage.css'

function PrivacyPage() {
  return (
    <main className="page">
      <PageHeader eyebrow="GDPR / Art. 13" title="Privacy Notice" />

      <section className="container legal-body">
        <div className="legal-warning">
          <strong>Before publishing:</strong> this page is a structural scaffold for a GDPR-compliant
          privacy notice, not a finished one. Every bracketed field must be completed accurately based on
          what this site's actual hosting, analytics, and contact mechanisms do — and reviewed by a
          qualified lawyer — before this site goes live. No compliance is claimed or implied by this
          scaffold.
        </div>

        <h2>1. Controller</h2>
        <dl className="legal-fields">
          <div>
            <dt>Name</dt>
            <dd>[PLACEHOLDER: full legal name of the data controller]</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>[PLACEHOLDER: street, postal code, city, country]</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>[PLACEHOLDER: contact email for data protection inquiries]</dd>
          </div>
        </dl>

        <h2>2. What data is processed</h2>
        <p className="body-copy">
          [PLACEHOLDER: describe your actual hosting provider's server log data — typically IP address,
          browser/device information, timestamp, and requested page, retained for a stated period for
          security and diagnostics.]
        </p>
        <p className="body-copy">
          [PLACEHOLDER: state whether any analytics service is used. If none, say so explicitly — this
          site currently ships with no third-party analytics, tracking pixels, or advertising scripts,
          and all fonts are self-hosted rather than loaded from a third-party CDN, so no visitor data is
          shared with a font or analytics provider by default. Update this section if that changes.]
        </p>
        <p className="body-copy">
          [PLACEHOLDER: if this site ever adds a contact form, newsletter signup, or comments, describe
          exactly what personal data is collected, why, how long it's retained, and who can see it.]
        </p>

        <h2>3. Legal basis</h2>
        <p className="body-copy">
          [PLACEHOLDER: state the Art. 6(1) GDPR basis for each processing activity above — e.g.
          legitimate interest (Art. 6(1)(f)) for basic server logs needed to operate the site securely,
          or consent (Art. 6(1)(a)) for any optional analytics or marketing.]
        </p>

        <h2>4. Cookies</h2>
        <p className="body-copy">
          [PLACEHOLDER: list any cookies set, their purpose, and duration. If this site uses no cookies
          beyond what's strictly necessary for it to function, state that explicitly and confirm no
          consent banner is required; otherwise describe the consent mechanism in place.]
        </p>

        <h2>5. Data recipients &amp; international transfers</h2>
        <p className="body-copy">
          [PLACEHOLDER: name the hosting provider and any other processor with access to visitor data,
          and state whether any transfer occurs outside the EU/EEA and under what safeguard.]
        </p>

        <h2>6. Retention</h2>
        <p className="body-copy">[PLACEHOLDER: state how long each category of data above is kept.]</p>

        <h2>7. Your rights</h2>
        <p className="body-copy">
          Under the GDPR, you have the right to request access to, rectification, or erasure of your
          personal data, to restrict or object to its processing, and to data portability, subject to the
          conditions set out in Articles 15–21 GDPR. To exercise any of these rights, contact the
          controller using the details above. You also have the right to lodge a complaint with a
          supervisory authority — for a site operated from the Netherlands, this is the{' '}
          <strong>Autoriteit Persoonsgegevens</strong> (Dutch Data Protection Authority).
        </p>
      </section>
    </main>
  )
}

export default PrivacyPage
