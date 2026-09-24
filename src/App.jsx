import { lazy, Suspense } from 'react'
import { Routes, Route, Outlet, useLocation } from 'react-router-dom'
import Nav from './components/site/Nav.jsx'
import Footer from './components/site/Footer.jsx'
import ScrollToTop from './components/site/ScrollToTop.jsx'
import './styles/site-theme.css'
import './App.css'

// Route-level code splitting: HeroPage (and Apollo11Page, via RocketViewer)
// pull in the entire three.js/GLTFLoader dependency graph. Static-importing
// every page here would ship that weight to a visitor reading the Privacy
// page. Lazy-loading means only the page actually visited pays for its own
// JS.
const HeroPage = lazy(() => import('./pages/HeroPage.jsx'))
const AboutPage = lazy(() => import('./pages/AboutPage.jsx'))
const ProgramPage = lazy(() => import('./pages/ProgramPage.jsx'))
const Apollo11Page = lazy(() => import('./pages/Apollo11Page.jsx'))
const MissionsIndexPage = lazy(() => import('./pages/MissionsIndexPage.jsx'))
const MissionDetailPage = lazy(() => import('./pages/MissionDetailPage.jsx'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'))

function Layout() {
  const location = useLocation()
  const isHero = location.pathname === '/'

  return (
    <>
      <ScrollToTop />
      <Nav isHero={isHero} />
      <Suspense fallback={<div className="route-loading" />}>
        <Outlet />
      </Suspense>
      {!isHero && <Footer />}
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HeroPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/program" element={<ProgramPage />} />
        <Route path="/apollo-11" element={<Apollo11Page />} />
        <Route path="/missions" element={<MissionsIndexPage />} />
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
