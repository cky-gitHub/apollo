import './PageHeader.css'

function PageHeader({ eyebrow, title, lede }) {
  return (
    <header className="page-header">
      <div className="container">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-header-title">{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
    </header>
  )
}

export default PageHeader
