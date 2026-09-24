import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted fonts (no Google Fonts CDN request — see src/styles/site-theme.css
// for the reasoning; this also keeps EU visitor IPs off a third-party host,
// relevant given the site's own GDPR privacy notice).
import '@fontsource-variable/fraunces/standard.css'
import '@fontsource-variable/fraunces/standard-italic.css'
import '@fontsource-variable/inter/standard.css'
import '@fontsource/jetbrains-mono/300.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/400-italic.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
