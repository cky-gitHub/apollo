// Apollo program mission roster — real historical data (crew, dates,
// landing sites). Apollo 8, 11, 13 and 17 are flagged `primary: true` per
// the site brief; everything else still gets a full stub entry. Uncrewed
// test flights (AS-201/202/203, Apollo 4/5/6) and the cancelled Apollo
// 18-20 are covered in prose on the Program overview page rather than as
// index cards here, to keep this list to the crewed missions.

export const MISSIONS = [
  {
    id: 1,
    slug: 'apollo-1',
    designation: 'Apollo 1',
    tag: 'Tragedy · never flew',
    dates: 'Planned Feb 21, 1967',
    crew: [
      { name: 'Virgil "Gus" Grissom', role: 'Commander' },
      { name: 'Edward H. White II', role: 'Senior Pilot' },
      { name: 'Roger B. Chaffee', role: 'Pilot' },
    ],
    summary:
      'A flash fire swept through the Command Module during a launch-pad test on January 27, 1967, killing all three astronauts in seconds. The disaster halted crewed flights for 21 months while the CM was rebuilt with a redesigned hatch, fireproof materials, and a nitrogen/oxygen cabin atmosphere for ground tests.',
    primary: false,
  },
  {
    id: 7,
    slug: 'apollo-7',
    designation: 'Apollo 7',
    tag: 'First crewed flight',
    dates: 'Oct 11–22, 1968',
    durationDays: 11,
    crew: [
      { name: 'Walter Schirra', role: 'Commander' },
      { name: 'Donn Eisele', role: 'CM Pilot' },
      { name: 'Walter Cunningham', role: 'LM Pilot' },
    ],
    summary:
      'The redesigned Command/Service Module’s first crewed test — 11 days in Earth orbit, no LM aboard. Every system needed for a lunar mission was exercised and the CSM was cleared to fly to the Moon.',
    primary: false,
  },
  {
    id: 8,
    slug: 'apollo-8',
    designation: 'Apollo 8',
    tag: 'First crewed lunar orbit',
    dates: 'Dec 21–27, 1968',
    durationDays: 6,
    crew: [
      { name: 'Frank Borman', role: 'Commander' },
      { name: 'James Lovell', role: 'CM Pilot' },
      { name: 'William Anders', role: 'LM Pilot' },
    ],
    summary:
      'The first crewed spacecraft to leave Earth orbit, reach the Moon, and orbit it — ten orbits on Christmas Eve 1968, a live television broadcast reading from Genesis, and the "Earthrise" photograph that reframed how a generation saw its own planet. No LM flew; this was a CSM-only trajectory test brought forward ahead of schedule.',
    primary: true,
  },
  {
    id: 9,
    slug: 'apollo-9',
    designation: 'Apollo 9',
    tag: 'First crewed LM flight',
    dates: 'Mar 3–13, 1969',
    durationDays: 10,
    crew: [
      { name: 'James McDivitt', role: 'Commander' },
      { name: 'David Scott', role: 'CM Pilot' },
      { name: 'Rusty Schweickart', role: 'LM Pilot' },
    ],
    summary:
      'Earth orbit only, but the first flight of the Lunar Module with a crew aboard — call signs Gumdrop and Spider. Rendezvous, docking, and a stand-up EVA proved the two-craft choreography Apollo 11 would need at the Moon.',
    primary: false,
  },
  {
    id: 10,
    slug: 'apollo-10',
    designation: 'Apollo 10',
    tag: 'Dress rehearsal',
    dates: 'May 18–26, 1969',
    durationDays: 8,
    crew: [
      { name: 'Thomas Stafford', role: 'Commander' },
      { name: 'John Young', role: 'CM Pilot' },
      { name: 'Eugene Cernan', role: 'LM Pilot' },
    ],
    summary:
      'The full Apollo 11 profile flown in lunar orbit without landing — Charlie Brown and Snoopy descended to within 15.6 km of the surface before staging back up, deliberately under-fueled so the crew could not be tempted to land first.',
    primary: false,
  },
  {
    id: 11,
    slug: 'apollo-11',
    designation: 'Apollo 11',
    tag: 'First Moon landing',
    dates: 'Jul 16–24, 1969',
    durationDays: 8,
    landingSite: 'Sea of Tranquility',
    crew: [
      { name: 'Neil Armstrong', role: 'Commander' },
      { name: 'Michael Collins', role: 'CM Pilot' },
      { name: 'Buzz Aldrin', role: 'LM Pilot' },
    ],
    summary:
      'The mission this site’s animation depicts. Armstrong and Aldrin landed Eagle in the Sea of Tranquility on July 20, 1969, spent 21.6 hours on the surface, and rejoined Collins in lunar orbit for the trip home — meeting the decade-end deadline John F. Kennedy set in 1961.',
    primary: true,
  },
  {
    id: 12,
    slug: 'apollo-12',
    designation: 'Apollo 12',
    tag: 'Precision landing',
    dates: 'Nov 14–24, 1969',
    durationDays: 10,
    landingSite: 'Ocean of Storms',
    crew: [
      { name: 'Charles "Pete" Conrad', role: 'Commander' },
      { name: 'Richard Gordon', role: 'CM Pilot' },
      { name: 'Alan Bean', role: 'LM Pilot' },
    ],
    summary:
      'Struck by lightning twice in the first minute of launch (the crew rode it out; a fast-thinking call to switch to auxiliary power saved the mission), then landed within walking distance of the uncrewed Surveyor 3 probe, proving pinpoint lunar landings were possible.',
    primary: false,
  },
  {
    id: 13,
    slug: 'apollo-13',
    designation: 'Apollo 13',
    tag: 'Successful failure',
    dates: 'Apr 11–17, 1970',
    durationDays: 6,
    crew: [
      { name: 'James Lovell', role: 'Commander' },
      { name: 'Jack Swigert', role: 'CM Pilot' },
      { name: 'Fred Haise', role: 'LM Pilot' },
    ],
    summary:
      'An oxygen tank ruptured 56 hours into the flight, crippling the Service Module. The Moon landing was abandoned; the crew used the Lunar Module as a lifeboat, looped around the Moon on free-return trajectory, and improvised a CO2 scrubber fix to get home. No one died — NASA still calls it a successful failure.',
    primary: true,
  },
  {
    id: 14,
    slug: 'apollo-14',
    designation: 'Apollo 14',
    tag: 'Fra Mauro highlands',
    dates: 'Jan 31–Feb 9, 1971',
    durationDays: 9,
    landingSite: 'Fra Mauro',
    crew: [
      { name: 'Alan Shepard', role: 'Commander' },
      { name: 'Stuart Roosa', role: 'CM Pilot' },
      { name: 'Edgar Mitchell', role: 'LM Pilot' },
    ],
    summary:
      'Flew the highland landing site Apollo 13 never reached. Shepard, the first American in space a decade earlier, became the oldest person to walk on the Moon at 47 — and hit two golf balls with a makeshift club before rejoining the LM.',
    primary: false,
  },
  {
    id: 15,
    slug: 'apollo-15',
    designation: 'Apollo 15',
    tag: 'First lunar rover',
    dates: 'Jul 26–Aug 7, 1971',
    durationDays: 12,
    landingSite: 'Hadley–Apennine',
    crew: [
      { name: 'David Scott', role: 'Commander' },
      { name: 'Alfred Worden', role: 'CM Pilot' },
      { name: 'James Irwin', role: 'LM Pilot' },
    ],
    summary:
      'The first of the extended "J-class" science missions — three days on the surface, the first Lunar Roving Vehicle, and a landing site chosen for geology (a canyon-rim and mountain-front site) rather than safety alone.',
    primary: false,
  },
  {
    id: 16,
    slug: 'apollo-16',
    designation: 'Apollo 16',
    tag: 'Descartes highlands',
    dates: 'Apr 16–27, 1972',
    durationDays: 11,
    landingSite: 'Descartes Highlands',
    crew: [
      { name: 'John Young', role: 'Commander' },
      { name: 'Thomas Mattingly', role: 'CM Pilot' },
      { name: 'Charles Duke', role: 'LM Pilot' },
    ],
    summary:
      'The only mission to a lunar highland site, chosen on the (mistaken) theory it would show volcanic rock — the samples returned were impact breccia instead, a useful correction to pre-mission geology.',
    primary: false,
  },
  {
    id: 17,
    slug: 'apollo-17',
    designation: 'Apollo 17',
    tag: 'Last crewed Moon landing',
    dates: 'Dec 7–19, 1972',
    durationDays: 12,
    landingSite: 'Taurus–Littrow',
    crew: [
      { name: 'Eugene Cernan', role: 'Commander' },
      { name: 'Ronald Evans', role: 'CM Pilot' },
      { name: 'Harrison "Jack" Schmitt', role: 'LM Pilot' },
    ],
    summary:
      'The last crewed mission to the Moon. Schmitt, a trained geologist, was the only scientist-astronaut to walk on the surface; Cernan’s final words stepping off the ladder — "we shall return, with peace and hope for all mankind" — remain, as of this writing, the last spoken by a person standing on another world.',
    primary: true,
  },
]

export function getMissionBySlug(slug) {
  return MISSIONS.find((mission) => mission.slug === slug)
}
