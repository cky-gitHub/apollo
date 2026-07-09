// Mission-phase metadata (0-13), keyed by index to match flow.phase.
//
// Telemetry is real (approximate) Apollo 11 data, sourced from the NASA
// Apollo 11 Flight Journal / mission timeline: met is Ground Elapsed Time in
// seconds at the phase's anchor event; distEarthKm is distance from Earth
// (altitude for the ascent phases, then cislunar range); distMoonKm is range
// to the Moon (384,400 km mean until the transit shrinks it); velocityMs is
// m/s at that point. Numbers are anchors, not decoration — the HUD spools
// between them as the flow advances.
export const PHASES = [
  {
    id: 0,
    name: 'Countdown',
    detail: 'Pad 39A · Kennedy Space Center',
    met: -10,
    distEarthKm: 0,
    distMoonKm: 384400,
    velocityMs: 0,
  },
  {
    id: 1,
    name: 'Ignition',
    detail: 'Five F-1 engines · 33,700 kN thrust',
    met: 0,
    distEarthKm: 0,
    distMoonKm: 384400,
    velocityMs: 0,
  },
  {
    id: 2,
    name: 'Liftoff',
    detail: 'Tower clear · 09:32 EDT, July 16 1969',
    met: 12,
    distEarthKm: 0.2,
    distMoonKm: 384400,
    velocityMs: 50,
  },
  {
    id: 3,
    name: 'Max-Q',
    detail: 'Peak aerodynamic pressure',
    met: 83,
    distEarthKm: 13,
    distMoonKm: 384400,
    velocityMs: 500,
  },
  {
    id: 4,
    name: 'S-IC Separation',
    detail: 'First stage staging · S-II ignition',
    met: 162,
    distEarthKm: 67,
    distMoonKm: 384300,
    velocityMs: 2760,
  },
  {
    id: 5,
    name: 'S-II Ascent',
    detail: 'Escape tower jettisoned',
    met: 220,
    distEarthKm: 100,
    distMoonKm: 384300,
    velocityMs: 4200,
  },
  {
    id: 6,
    name: 'Trans-Lunar Injection',
    detail: 'S-IVB restart · departure for the Moon',
    met: 10203, // 002:50:03 GET, TLI cutoff
    distEarthKm: 334,
    distMoonKm: 384000,
    velocityMs: 10840,
  },
  {
    id: 7,
    name: 'Transposition & Docking',
    detail: 'SLA panels jettisoned · Columbia extracts Eagle',
    met: 12240, // 003:24:00 GET
    distEarthKm: 22000,
    distMoonKm: 362000,
    velocityMs: 5300,
  },
  {
    id: 8,
    name: 'Lunar Orbit Insertion',
    detail: 'SPS braking burn · 100 km above the Moon',
    met: 273000, // 075:50:00 GET
    distEarthKm: 386000,
    distMoonKm: 100,
    velocityMs: 1600,
  },
  {
    id: 9,
    name: 'Powered Descent',
    detail: 'Eagle lands · Sea of Tranquility',
    met: 369940, // 102:45:40 GET, contact
    distEarthKm: 389000,
    distMoonKm: 0,
    velocityMs: 0,
  },
  {
    id: 10,
    name: 'Tranquility Base',
    detail: 'One small step · 21.6 h on the surface',
    met: 393855, // 109:24:15 GET, first step
    distEarthKm: 389000,
    distMoonKm: 0,
    velocityMs: 0,
  },
  {
    id: 11,
    name: 'Ascent & Rendezvous',
    detail: 'Descent stage left as launch pad · docking with Columbia',
    met: 460980, // 128:03:00 GET, docking
    distEarthKm: 389000,
    distMoonKm: 110,
    velocityMs: 1630,
  },
  {
    id: 12,
    name: 'Trans-Earth Injection',
    detail: 'SPS fires for home · Eagle left behind',
    met: 487422, // 135:23:42 GET, TEI cutoff
    distEarthKm: 385000,
    distMoonKm: 3200,
    velocityMs: 2700,
  },
  {
    id: 13,
    name: 'Reentry & Splashdown',
    detail: 'Entry at 39,700 km/h · Pacific recovery',
    met: 703115, // 195:18:35 GET, splashdown
    distEarthKm: 0,
    distMoonKm: 375000,
    velocityMs: 0,
  },
]

export const MAX_PHASE = PHASES.length - 1
