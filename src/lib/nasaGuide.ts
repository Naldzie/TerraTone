/* Field-guide knowledge for talking NPCs — real NASA-grounded science.
 *
 * Facts below are stable, textbook-level findings from NASA's Earth science
 * work; each topic links only to high-level NASA pages that exist
 * (program homepages, not deep articles that could rot). The chat prompt
 * instructs the model to stick to these facts + the live sim context and to
 * point at the Sources list instead of inventing URLs. AI answers are still
 * labeled AI-generated in the UI — grounding reduces hallucination, it does
 * not eliminate it.
 */

export type GuideTopic = 'tornado' | 'hurricane' | 'earthquake' | 'volcano' | 'ocean' | 'wildfire' | 'tsunami' | 'blackhole' | 'bigbang' | 'sun';

export interface GuideSource { label: string; url: string }

export interface TopicGuide {
  title: string;
  facts: string[];
  sources: GuideSource[];
  questions: string[];
}

const EARTH_OBSERVATORY = { label: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov/' };
const EARTHDATA = { label: 'NASA Earthdata', url: 'https://earthdata.nasa.gov/' };
const NASA_EARTH = { label: 'NASA Earth Science', url: 'https://www.nasa.gov/earth/' };

export const GUIDES: Record<GuideTopic, TopicGuide> = {
  tornado: {
    title: 'Tornadoes',
    facts: [
      'Tornadoes form inside severe rotating thunderstorms (supercells) when wind shear tilts rising air into a spinning mesocyclone.',
      'The U.S. Enhanced Fujita (EF) scale rates tornadoes EF0–EF5 by the damage they cause, a proxy for wind speed.',
      'NASA studies severe storms with satellites and airborne campaigns to understand how storms intensify; tornado warnings themselves come from NOAA National Weather Service forecasters.',
      'Tornadoes are measured in hundreds of meters wide and last minutes — their parent supercell can span tens of kilometers.',
    ],
    sources: [EARTH_OBSERVATORY, EARTHDATA, { label: 'NOAA Storm Safety', url: 'https://www.noaa.gov/tornadoes' }],
    questions: ['How does a real tornado form?', 'What does the EF scale mean?', 'What should I do in a real tornado warning?'],
  },
  hurricane: {
    title: 'Hurricanes',
    facts: [
      'Hurricanes are heat engines: warm ocean water (roughly 26.5°C and up) evaporates, rises, and releases latent heat that powers the storm.',
      'Earth rotates the inflow into the famous spiral; the calm eye sits inside the violent eyewall where the strongest winds blow.',
      'NASA\'s GPM mission measures rainfall inside tropical cyclones from space: https://gpm.nasa.gov/.',
      'Storm surge — ocean water pushed ashore — causes most hurricane deaths, and higher background sea levels make surge worse: https://sealevel.nasa.gov/.',
    ],
    sources: [EARTH_OBSERVATORY, { label: 'NASA GPM Precipitation', url: 'https://gpm.nasa.gov/' }, { label: 'NASA Sea Level Change', url: 'https://sealevel.nasa.gov/' }],
    questions: ['What feeds a hurricane?', 'What is the eye and eyewall?', 'Why is storm surge so deadly?'],
  },
  earthquake: {
    title: 'Earthquakes',
    facts: [
      'Earthquakes release energy stored as tectonic plates grind past each other; fast P-waves arrive first, then the destructive S- and surface waves.',
      'Each whole-number magnitude step releases roughly 32 times more energy — a magnitude 7 is vastly larger than a 6, not slightly larger.',
      'NASA uses space radar interferometry (InSAR) to map millimeters of ground deformation before and after quakes.',
      'No method reliably predicts the time, place, and size of an earthquake — beware anyone claiming otherwise.',
    ],
    sources: [EARTHDATA, EARTH_OBSERVATORY, NASA_EARTH],
    questions: ['Why do bigger magnitudes jump so fast in energy?', 'What are P-waves and S-waves?', 'How do satellites see quakes from space?'],
  },
  volcano: {
    title: 'Volcanoes',
    facts: [
      'Eruptions fragment magma into ash when trapped gas bubbles burst; runny basaltic lava can flow for kilometers while sticky magma explodes.',
      'The biggest killers are often not lava but pyroclastic flows, lahars (volcanic mudflows), and toxic gas — dangerous kilometers from the vent.',
      'NASA tracks ash plumes and volcanic gases from orbit to protect aviation and study climate effects: https://earthdata.nasa.gov/.',
      'Volcano shape tells its style: broad shield volcanoes ooze, steep stratovolcanoes tend to explode.',
    ],
    sources: [EARTHDATA, EARTH_OBSERVATORY, NASA_EARTH],
    questions: ['Why do some volcanoes ooze and others explode?', 'What actually kills in eruptions?', 'How does NASA watch volcanoes from space?'],
  },
  ocean: {
    title: 'The Deep Ocean',
    facts: [
      'Water absorbs high frequencies fast, so the deep sea sounds muffled and low; whale calls can travel entire ocean basins.',
      'Pressure rises about 1 atmosphere every 10 m of depth — at 200 m a diver feels ~21 atm squeezing everything.',
      'NASA\'s SWOT mission maps ocean height from space, revealing currents and eddies: https://swot.jpl.nasa.gov/.',
      'Sunlight fades with depth: the sunlit zone gives way to the twilight zone (~200–1000 m) and then near-total darkness.',
    ],
    sources: [{ label: 'NASA SWOT Ocean Mission', url: 'https://swot.jpl.nasa.gov/' }, { label: 'NASA Sea Level Change', url: 'https://sealevel.nasa.gov/' }, EARTH_OBSERVATORY],
    questions: ['Why is the deep ocean so quiet and dark?', 'How much pressure is there at 200 m?', 'How do satellites see ocean currents?'],
  },
  tsunami: {
    title: 'Tsunamis',
    facts: [
      'Most tsunamis are triggered by undersea earthquakes (also landslides or eruptions) — they are not weather events, and they cannot be surfed or outrun.',
      'In the open ocean a tsunami can be under a meter tall yet travel at jetliner speeds (700+ km/h) with wavelengths over 100 km; it only steepens into a wall as the water shallows near shore.',
      'NASA satellite altimeters like Sentinel-6 Michael Freilich measure sea surface height from orbit, helping map the ocean; tsunami detection itself relies on ocean buoy networks such as NOAA\'s DART.',
      'The natural warning is the ground itself: strong or long shaking at the coast, or the sea suddenly pulling back, means move to high ground immediately — official warnings may arrive too late nearby.',
    ],
    sources: [{ label: 'NOAA Tsunami Warning Centers', url: 'https://www.tsunami.gov/' }, { label: 'NASA Sea Level Change', url: 'https://sealevel.nasa.gov/' }, EARTH_OBSERVATORY],
    questions: ['How is a tsunami different from a normal wave?', 'Why does it grow taller at the shore?', 'What should I do if the sea suddenly pulls back?'],
  },
  wildfire: {
    title: 'Wildfires',
    facts: [
      'Fire needs heat, oxygen, and fuel — dry vegetation sets fuel readiness, and wind drives how fast a front spreads.',
      'NASA\'s FIRMS system maps active fires worldwide nearly in real time from MODIS and VIIRS satellite sensors: https://firms.modaps.eosdis.nasa.gov/.',
      'Smoke is the big health hazard: fine particles travel hundreds of kilometers and spike air-quality indexes.',
      'Many ecosystems evolved with fire, but hotter, drier conditions are making fire seasons longer and more severe.',
    ],
    sources: [{ label: 'NASA FIRMS Active Fires', url: 'https://firms.modaps.eosdis.nasa.gov/' }, EARTH_OBSERVATORY, EARTHDATA],
    questions: ['What three things does fire need?', 'Where can I see real fires burning right now?', 'Why is wildfire smoke dangerous far away?'],
  },
  blackhole: {
    title: 'Black holes',
    facts: [
      'A black hole is mass packed inside its Schwarzschild radius — about 3 km per solar mass — where escaping would take more than the speed of light.',
      'What telescopes see is a shadow about 2.6 times the horizon radius, ringed by light bent around the hole; the Event Horizon Telescope imaged M87* in 2019 and Sagittarius A* in 2022.',
      'Gas in the accretion disk heats to millions of degrees and shines in X-rays; the side moving toward us looks brighter because of relativistic beaming. NASA\'s Chandra X-ray Observatory studies them: https://chandra.harvard.edu/.',
      'Near a black hole, clocks run slow (gravitational time dilation) and tides stretch objects — far more violently near small stellar black holes than near supermassive ones.',
      'In 2022 NASA turned pressure waves from the black hole in the Perseus galaxy cluster into sound, raising them about 57 octaves to make them audible: https://science.nasa.gov/universe/black-holes/.',
    ],
    sources: [{ label: 'NASA Black Holes', url: 'https://science.nasa.gov/universe/black-holes/' }, { label: 'Chandra X-ray Observatory', url: 'https://chandra.harvard.edu/' }, { label: 'Event Horizon Telescope', url: 'https://eventhorizontelescope.org/' }],
    questions: ['What is the event horizon?', 'Why is one side of the disk brighter?', 'Would I be spaghettified?'],
  },
  bigbang: {
    title: 'The Big Bang & cosmic history',
    facts: [
      'The Big Bang was the expansion of space everywhere at once about 13.8 billion years ago, not an explosion at a single point — so every distant galaxy moves away from every other.',
      'In the first few minutes the hot plasma fused hydrogen into helium (about 25 % by mass); at about 380,000 years it cooled to ~3,000 K, atoms formed, and light streamed free as the cosmic microwave background.',
      'NASA\'s COBE and WMAP satellites mapped the tiny temperature ripples in that background, the seeds of every galaxy: https://map.gsfc.nasa.gov/.',
      'The first stars lit up after about 100–200 million years; the James Webb Space Telescope is hunting the earliest galaxies: https://science.nasa.gov/mission/webb/.',
      'About 5 billion years ago dark energy began to make the expansion speed up; today\'s rate is the Hubble constant, roughly 67–73 km/s per megaparsec.',
    ],
    sources: [{ label: 'NASA WMAP Cosmology', url: 'https://map.gsfc.nasa.gov/' }, { label: 'NASA James Webb Space Telescope', url: 'https://science.nasa.gov/mission/webb/' }, { label: 'NASA Universe', url: 'https://science.nasa.gov/universe/' }],
    questions: ['Where did the Big Bang happen?', 'What is the cosmic microwave background?', 'Why is the expansion speeding up?'],
  },
  sun: {
    title: 'The Sun & space weather',
    facts: [
      'The Sun is a 5,772 K ball of plasma that rotates differentially — about 25 days at the equator and about 35 days near the poles. That shear winds up magnetic fields that surface as sunspots.',
      'Sunspots follow an ~11-year cycle; new spots appear near 30° latitude and drift toward the equator as the cycle goes on (Spörer\'s law). NASA\'s Solar Dynamics Observatory images the Sun every few seconds: https://sdo.gsfc.nasa.gov/.',
      'Solar flares are ranked by peak X-ray flux as A, B, C, M or X classes, each ten times stronger than the last. Their light reaches Earth in about 8 minutes and can black out HF radio on the dayside.',
      'Coronal mass ejections carry billions of tonnes of magnetized plasma and take roughly one to four days to reach Earth. When they hit, they compress the magnetosphere, raise the Kp index and push the aurora toward the equator. NOAA SWPC issues R, S and G scale alerts: https://www.swpc.noaa.gov/.',
      'Parker Solar Probe flies through the outer corona to learn why it is millions of degrees hotter than the visible surface: https://science.nasa.gov/mission/parker-solar-probe/.',
    ],
    sources: [{ label: 'NASA Solar Dynamics Observatory', url: 'https://sdo.gsfc.nasa.gov/' }, { label: 'NOAA Space Weather Prediction Center', url: 'https://www.swpc.noaa.gov/' }, { label: 'NASA Parker Solar Probe', url: 'https://science.nasa.gov/mission/parker-solar-probe/' }],
    questions: ['Why does the Sun have spots?', 'How fast does a CME reach Earth?', 'Why is the corona hotter than the surface?'],
  },
};

export interface ChatTurn { role: 'user' | 'model'; text: string }

/** Build the grounded NPC prompt (pure, tested). History capped to last 6 turns. */
export function buildGuidePrompt(
  topic: GuideTopic,
  npcName: string,
  simContext: string,
  history: ChatTurn[],
  message: string,
): string {
  const g = GUIDES[topic];
  const recent = history.slice(-6).map((h) => `${h.role === 'user' ? 'Visitor' : npcName}: ${h.text}`).join('\n');
  return [
    `You are ${npcName}, a friendly field guide inside the TerraTone training simulator (topic: ${g.title}).`,
    'Answer in 150 words or fewer, plain language, no emojis. Stay in character lightly — you are helpful first, theatrical never.',
    'Base your science ONLY on these NASA-grounded facts unless the visitor asks about the simulation itself:',
    ...g.facts.map((f, i) => `${i + 1}. ${f}`),
    'Rules: never invent NASA URLs or dataset values; if asked for live data or forecasts, say you cannot provide them and point at the Sources list below instead. If asked about real-world danger, give the safe action first.',
    `Live simulation right now (SIMULATED values, say so if relevant): ${simContext}`,
    ...(recent ? ['Conversation so far:', recent] : []),
    `Visitor: ${message}`,
    `${npcName}:`,
  ].join('\n');
}

/** One-line source list rendered under every AI answer. */
export function guideSources(topic: GuideTopic): GuideSource[] {
  return GUIDES[topic].sources;
}
