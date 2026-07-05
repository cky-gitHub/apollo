// Saturn V / Apollo stage reference data — dimensions and engine layout.
// Plain data only, no three.js imports or geometry code. Sourced from the
// real Saturn V/Apollo spec sheet; feeds the inspection detail panels.
// Units: meters.

export const STAGE_ORDER = ['S-IC', 'S-II', 'S-IVB', 'CSM', 'LM']

export const STAGE_SPECS = {
  'S-IC': {
    id: 'S-IC',
    label: 'S-IC (First Stage)',
    diameter: 10.1,
    length: 42,
    engines: { count: 5, type: 'F-1', arrangement: 'quincunx' },
  },
  'S-II': {
    id: 'S-II',
    label: 'S-II (Second Stage)',
    diameter: 10.1,
    length: 24.8,
    engines: { count: 5, type: 'J-2', arrangement: 'quincunx' },
  },
  'S-IVB': {
    id: 'S-IVB',
    label: 'S-IVB (Third Stage)',
    diameter: 6.6,
    length: 17.8,
    engines: { count: 1, type: 'J-2', arrangement: 'centered' },
  },
  CSM: {
    id: 'CSM',
    label: 'CSM (Command/Service Module)',
    diameter: 3.9,
    length: 11,
    engines: { count: 1, type: 'SPS', arrangement: 'centered' },
  },
  LM: {
    id: 'LM',
    label: 'LM (Lunar Module)',
    diameter: 4.3,
    length: 7,
    engines: { count: 1, type: 'descent engine', arrangement: 'centered' },
  },
}
