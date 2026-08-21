import PageHeader from '../components/site/PageHeader.jsx'
import '../App.css'
import './LegalPage.css'

function ImpressumPage() {
  return (
    <main className="page">
      <PageHeader eyebrow="Legal notice" title="Impressum" />

      <section className="container legal-body">
        <div className="legal-warning">
          <strong>Before publishing:</strong> this page is a structural scaffold, not a finished legal
          notice. Every bracketed field below must be filled in with real, accurate information, and the
          whole page should be reviewed by a qualified lawyer for your actual jurisdiction and business
          setup before this site goes live. Nothing on this page should be treated as legal advice or as
          evidence of compliance as it stands.
        </div>

        <p className="body-copy">
          German-speaking visitors in particular expect an Impressum on any professionally-run website,
          even where — as here, for a site operated from the Netherlands — it isn't strictly mandated by
          Dutch law in the same form. This page provides that disclosure voluntarily, in the structure a
          German audience expects.
        </p>

        <h2>Service provider</h2>
        <dl className="legal-fields">
          <div>
            <dt>Name</dt>
            <dd>[PLACEHOLDER: full legal name of the individual or company]</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>[PLACEHOLDER: street, postal code, city, country]</dd>
          </div>
          <div>
            <dt>Represented by</dt>
            <dd>[PLACEHOLDER: name of owner/director, if the operator is a company]</dd>
          </div>
        </dl>

        <h2>Contact</h2>
        <dl className="legal-fields">
          <div>
            <dt>Email</dt>
            <dd>[PLACEHOLDER: contact email address]</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>[PLACEHOLDER: contact phone number, optional]</dd>
          </div>
        </dl>

        <h2>Registration</h2>
        <dl className="legal-fields">
          <div>
            <dt>Chamber of Commerce (KVK) number</dt>
            <dd>[PLACEHOLDER: if operating as a registered business in the Netherlands]</dd>
          </div>
          <div>
            <dt>VAT ID</dt>
            <dd>[PLACEHOLDER: if applicable]</dd>
          </div>
        </dl>

        <h2>Responsible for content</h2>
        <p className="body-copy">
          [PLACEHOLDER: name and address of the person responsible for editorial content, per the
          equivalent of § 18 Abs. 2 MStV — usually the same as the service provider above for a personal
          site.]
        </p>

        <h2>Disclaimer</h2>
        <p className="body-copy">
          This site is an independent, unofficial project about the history of the Apollo program. It is
          not affiliated with, endorsed by, or sponsored by NASA. Historical content is compiled in good
          faith from public sources and is provided for informational purposes; no warranty is made as
          to its completeness or accuracy. This site may link to third-party websites; the operator has
          no influence over and accepts no liability for the content of external sites.
        </p>
      </section>
    </main>
  )
}

export default ImpressumPage
