/** Guided-tour content for every TerraTone page. Pure data (no React), so
 *  it bundles into the app shell and works offline like everything else.
 *
 *  A step's `target` is one or more CSS selectors (optionally narrowed by the
 *  element's text). The tour highlights the first one that is visible right
 *  now, so a single tour covers both the desktop sidebar and the phone tab
 *  bar. A step with no visible target is shown as a centred card. */
import type { TabId } from '../store/AppContext';

export type TourTarget = string | { sel: string; text: string };

export interface TourStep {
  target?: TourTarget | TourTarget[];
  title: string;
  body: string;
}

/** Tour ids: every app tab, the hazard-simulator view and the landing page. */
export type TourId = TabId | 'sim' | 'landing';

const section = (text: string): TourTarget => ({ sel: '.main .section-title', text });

const NAV_STEP: TourStep = {
  target: ['.side', '.topnav'],
  title: 'Move between pages',
  body: 'Explore, Listen, Live, Events, Sims, Studio, Library, Access and Settings all live here. Each page has its own tour.',
};

const HEADER_STEP: TourStep = {
  target: '.topbar__tools',
  title: 'Guide, Home and Profile',
  body: 'Guide replays this tour for whatever page you are on. Home takes you back to the landing page. Profile opens your explorer look.',
};

const SIM_STEPS = (kind: 'hazard' | 'storm'): TourStep[] => [
  {
    title: kind === 'storm' ? 'Tornado simulator' : 'Hazard simulator',
    body: 'A 3D training world with sound synthesized live on your device. It is a simulation for learning, never a forecast.',
  },
  {
    target: '[data-tour="sim-nav"]',
    title: 'Leave the simulator',
    body: '"All simulators" goes back to the library. "Home" returns to the landing page. Both stop the sound.',
  },
  {
    target: '.main .hero .row',
    title: 'Play, pause and reset',
    body: 'Play starts the world with sound and goes fullscreen. Pause freezes it; Reset puts you back at the start.',
  },
  {
    target: '.simstage',
    title: 'The 3D world',
    body: 'Move with WASD or the arrow keys (the joystick on touch screens). The mouse looks around after Play; Esc gives it back.',
  },
  {
    target: '.simhud',
    title: 'Heads-up display',
    body: 'Compass heading, distance to the hazard and the current conditions. The minimap shows where you and the bystanders are.',
  },
  {
    target: '.simbtns',
    title: 'Simulator controls',
    body: 'Fullscreen (F), Settings (Q), Walk/Run (Shift), Jump (Space), ride vehicles (E), talk to bystanders (T) and the "?" controls guide (H). Home also lives here so you can leave from fullscreen.',
  },
  {
    target: '[aria-label="Simulation status"]',
    title: 'Status and science',
    body: 'Live readings from the simulation, gauges, how each sound is made, and a short lesson about the real hazard.',
  },
];

export const TOURS: Record<TourId, { label: string; steps: TourStep[] }> = {
  landing: {
    label: 'Landing page',
    steps: [
      {
        title: 'Welcome to TerraTone',
        body: 'TerraTone turns NASA Earth-science data into sound. This quick tour shows what is on the landing page.',
      },
      {
        target: '.landing__pages',
        title: 'Landing pages',
        body: 'Home, Get the app, Stats, About and Privacy. Switch between them at any time.',
      },
      {
        target: '.landing__proceed',
        title: 'Enter the app',
        body: 'Opens the full TerraTone app in your browser. No account needed, and it keeps working offline.',
      },
      {
        target: '.landing__quicklinks',
        title: 'Shortcuts',
        body: 'Jump straight to installing the app, the usage numbers, or meeting the team.',
      },
      {
        target: '.landing__guide',
        title: 'Need this again?',
        body: 'Press Guide whenever you want this tour. Inside the app, the Guide button explains the page you are on.',
      },
    ],
  },
  explore: {
    label: 'Explore',
    steps: [
      {
        title: 'Explore',
        body: 'Your starting point: browse Earth datasets, fetch live NASA readings and jump back into recent listens.',
      },
      {
        target: '.main .hero',
        title: 'What TerraTone does',
        body: 'Earth data becomes pitch, loudness and rhythm. The badge shows whether you are online, offline or using cached data.',
      },
      {
        target: '.main [role="search"]',
        title: 'Find a dataset',
        body: 'Search by name or filter by category such as climate, ocean or hazards.',
      },
      {
        target: '.main .grid .card',
        title: 'Dataset cards',
        body: 'Each card shows where the data comes from (demo or NASA). "Open & listen" plays it on the Listen page.',
      },
      {
        target: section('Live NASA data'),
        title: 'Live NASA data',
        body: 'Fetch real temperatures for any place from NASA POWER and save them for offline listening.',
      },
      {
        target: section('Recently played'),
        title: 'Recently played',
        body: 'Everything you listened to on this device, ready to replay.',
      },
      NAV_STEP,
      HEADER_STEP,
    ],
  },
  listen: {
    label: 'Listen',
    steps: [
      {
        title: 'Listen',
        body: 'Play a dataset as sound and watch the chart move with it, with captions for every frame.',
      },
      {
        target: '#ds',
        title: 'Pick a dataset',
        body: 'Choose what to hear. "Get live NASA data" opens the Live page for fresher readings.',
      },
      {
        target: '.main .card',
        title: 'About this dataset',
        body: 'Its source, units, range and a plain-language summary, so the sound always has context.',
      },
      {
        target: '.main .player',
        title: 'The player',
        body: 'The chart and the sound play together. Captions describe each value as it plays.',
      },
      {
        target: '.main .transport',
        title: 'Playback controls',
        body: 'Play, pause, restart and change speed. The Sound button opens instrument and mapping settings.',
      },
      {
        target: { sel: '.main .card', text: 'AI explanation' },
        title: 'AI explanation (optional)',
        body: 'With your own Gemini key, get a short machine-written explanation of what you are hearing.',
      },
      NAV_STEP,
    ],
  },
  online: {
    label: 'Live',
    steps: [
      {
        target: '.main .hero',
        title: 'Live from NASA',
        body: 'Real NASA data from today: weather for any place, active fires, visualizations and photos of Earth.',
      },
      {
        target: section('Hear the latest conditions'),
        title: 'Hear the latest conditions',
        body: 'Pick a city or drop a pin on the map, choose what to measure, then play NASA’s newest readings for that spot.',
      },
      {
        target: '.main .nowchips',
        title: 'One-tap readings',
        body: 'Quick buttons for temperature, rain, wind and more at the chosen place.',
      },
      {
        target: section('Everything live here'),
        title: 'Every live variable',
        body: 'The full list of NASA POWER variables you can turn into sound — no key needed.',
      },
      {
        target: section('Active fires'),
        title: 'Active fires',
        body: 'Near-real-time fire detections from NASA FIRMS. Play them as sound or open the wildfire simulator.',
      },
      {
        target: section('NASA visualizations'),
        title: 'NASA visualizations',
        body: 'Scientific Visualization Studio stories you can watch and listen to.',
      },
      {
        target: section('Earth from space'),
        title: 'Earth from space',
        body: 'The latest full-disc photo of Earth from the EPIC camera, plus NASA’s Astronomy Picture of the Day below.',
      },
    ],
  },
  events: {
    label: 'Events',
    steps: [
      {
        target: '.main .hero',
        title: 'Natural events now',
        body: 'Wildfires, storms, volcanoes and more that NASA’s EONET is tracking today.',
      },
      {
        target: '[aria-label="Filter events by category"]',
        title: 'Filter by category',
        body: 'Show only one kind of event. Refresh fetches the newest list; offline you see the last saved one.',
      },
      {
        target: ['.main .leaflet-container', '.main .eventmap', '.main .card'],
        title: 'Map and list',
        body: 'Every event is placed on the map and listed with its date and category.',
      },
      {
        target: '.main .eventrow',
        title: 'Try it in a simulator',
        body: 'Tap an event to open the matching training simulator and hear what that hazard sounds like.',
      },
    ],
  },
  sims: {
    label: 'Sims',
    steps: [
      {
        target: '.main .hero',
        title: 'Simulator library',
        body: 'Explorable 3D training worlds with live synthesized sound. Everything runs on your device and works offline.',
      },
      {
        target: '.main .grid .card',
        title: 'Pick a world',
        body: 'Each card shows the hazard, its difficulty and presets. Launch opens the simulator.',
      },
      {
        target: '.main .grid .card .btn.primary',
        title: 'Launch',
        body: 'Opens the simulator. Press Guide again inside it for a tour of its controls.',
      },
      {
        target: '.main > div > .alert',
        title: 'Learning, not forecasting',
        body: 'These worlds teach how environmental sound works. For real emergencies, follow official guidance.',
      },
    ],
  },
  sim: { label: 'Simulator', steps: SIM_STEPS('hazard') },
  storm: { label: 'Tornado simulator', steps: SIM_STEPS('storm') },
  studio: {
    label: 'Studio',
    steps: [
      {
        target: '.main .steplist',
        title: 'Earth Jukebox Studio',
        body: 'Build your own mix in four steps: dataset, time range, mapping profile, then preview and save.',
      },
      {
        target: '#sd',
        title: '1 · Dataset',
        body: 'Choose the data your mix is made from.',
      },
      {
        target: '[aria-label="From frame slider"]',
        title: '2 · Time range',
        body: 'Trim the series with the From and To sliders to focus on the part you want to hear.',
      },
      {
        target: '.main .card',
        title: '3 · Profile, preview and record',
        body: 'Pick a sound profile, preview it, record a clip (where supported), then save or share it as a file.',
      },
      {
        target: '.main .player',
        title: 'Synced show',
        body: 'The compact player plays your mix with the chart moving in time.',
      },
    ],
  },
  library: {
    label: 'Library',
    steps: [
      {
        target: section('Dataset library'),
        title: 'Your library',
        body: 'Everything saved on this device, with the storage it uses.',
      },
      {
        target: '.main [role="search"]',
        title: 'Search and filter',
        body: 'Find a dataset by name, or show only downloads or bundled demos.',
      },
      {
        target: '.main .grid .card',
        title: 'Saved datasets',
        body: 'Play a dataset, export it, or delete downloads you no longer need. Everything here replays offline.',
      },
      {
        target: section('Saved experiences'),
        title: 'Saved experiences',
        body: 'Mixes you saved in Studio. Reopen one to hear it again.',
      },
    ],
  },
  access: {
    label: 'Access',
    steps: [
      {
        target: '.main .alert',
        title: 'Accessibility first',
        body: 'Every sound comes with text summaries, captions, units and ranges so you never rely on hearing alone.',
      },
      {
        target: '#ts',
        title: 'Text size',
        body: 'Make all text larger or more compact.',
      },
      {
        target: '.main .switchrow',
        title: 'Contrast, motion and quiet mode',
        body: 'High contrast, Reduce motion (also calms this tour) and Quiet mode, which keeps captions but stops all sound.',
      },
      {
        target: { sel: '.main h3', text: 'Keyboard map' },
        title: 'Keyboard map',
        body: 'Every shortcut in one place. The whole app works with a keyboard.',
      },
      {
        target: { sel: '.main h3', text: 'How to read the sound' },
        title: 'How to read the sound',
        body: 'What higher pitch, louder volume and faster rhythm mean in the data.',
      },
    ],
  },
  settings: {
    label: 'Settings',
    steps: [
      {
        target: '#prof',
        title: 'Sound defaults',
        body: 'Default sound profile, volume and playback speed for every dataset.',
      },
      {
        target: section('Cinematic startup'),
        title: 'Cinematic startup',
        body: 'Turn the opening Earth animation on or off, choose how often it plays, and preview it.',
      },
      {
        target: section('Explorer look'),
        title: 'Explorer look',
        body: 'Design the character you play as in every simulator.',
      },
      {
        target: section('About'),
        title: 'Data honesty',
        body: 'What "demo", "live" and "cached" data mean, and which NASA services TerraTone uses.',
      },
    ],
  },
};

/* ---------- target lookup ---------- */

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** First visible element for a step, or null for a centred card. */
export function findTourTarget(target: TourStep['target']): HTMLElement | null {
  if (!target || typeof document === 'undefined') return null;
  const list = Array.isArray(target) ? target : [target];
  for (const t of list) {
    const sel = typeof t === 'string' ? t : t.sel;
    const text = typeof t === 'string' ? null : t.text.toLowerCase();
    let nodes: NodeListOf<HTMLElement>;
    try {
      nodes = document.querySelectorAll<HTMLElement>(sel);
    } catch {
      continue;
    }
    for (const el of Array.from(nodes)) {
      if (text && !(el.textContent ?? '').toLowerCase().includes(text)) continue;
      if (isVisible(el)) return el;
    }
  }
  return null;
}

/** Which tour fits what is on screen: an open hazard simulator gets its own. */
export function tourIdFor(tab: TabId): TourId {
  if (tab === 'sims' && typeof document !== 'undefined' && document.querySelector('.main .simstage')) return 'sim';
  return tab;
}

/* ---------- first-visit offer (remembered on this device) ---------- */

const OFFER_KEY = 'terratone.tourOffer.v1';

export function tourOfferPending(): boolean {
  try {
    return window.localStorage.getItem(OFFER_KEY) == null;
  } catch {
    return false;
  }
}

export function dismissTourOffer(): void {
  try {
    window.localStorage.setItem(OFFER_KEY, 'done');
  } catch { /* storage blocked: the offer just shows again next time */ }
}
