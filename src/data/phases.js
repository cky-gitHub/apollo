// Placeholder mission-phase metadata (0-9), keyed by index to match
// flow.phase. Altitude (km) / velocity (m/s) are rough placeholder
// estimates for HUD plumbing, not verified mission data.

export const PHASES = [
  { id: 0, name: 'Countdown', altitude: 0, velocity: 0 },
  { id: 1, name: 'Ignition', altitude: 0, velocity: 0 },
  { id: 2, name: 'Liftoff', altitude: 0.2, velocity: 100 },
  { id: 3, name: 'Max-Q', altitude: 13, velocity: 480 },
  { id: 4, name: 'S-IC Separation', altitude: 65, velocity: 2300 },
  { id: 5, name: 'S-II Ascent', altitude: 110, velocity: 6900 },
  { id: 6, name: 'S-IVB Burn / TLI', altitude: 185, velocity: 10400 },
  { id: 7, name: 'Transposition & Docking', altitude: 60000, velocity: 7500 },
  { id: 8, name: 'Lunar Approach', altitude: 340000, velocity: 1600 },
  { id: 9, name: 'Lunar Surface', altitude: 0, velocity: 0 },
]
