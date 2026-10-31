/* Bundled demonstration datasets.
 *
 * IMPORTANT — scientific honesty: these are SMALL, SYNTHETIC demonstration
 * series inspired by well-known public records (GISTEMP-style temperature
 * anomalies, Mauna Loa-style CO2 growth, altimetry-style sea-level rise).
 * They are clearly labeled provenance:"sample" everywhere in the UI and are
 * NEVER presented as live NASA data. Full-resolution science data comes from
 * the Online integrations (NASA POWER / GIBS / CMR) or user imports.
 */
import type { DatasetMeta } from '../types';

function annual(start: number, values: number[]): { t: string; value: number }[] {
  return values.map((value, i) => ({ t: String(start + i), value }));
}
function monthly(startYear: number, months: number, fn: (i: number) => number | null): { t: string; value: number | null }[] {
  const out: { t: string; value: number | null }[] = [];
  for (let i = 0; i < months; i++) {
    const y = startYear + Math.floor(i / 12);
    const m = String((i % 12) + 1).padStart(2, '0');
    out.push({ t: `${y}-${m}`, value: fn(i) });
  }
  return out;
}
/** Hourly-style demo timestamps: startISO like '2026-03-01', step in hours. */
function subdaily(startISO: string, stepHours: number, count: number, fn: (i: number) => number | null): { t: string; value: number | null }[] {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const iso = new Date(start + i * stepHours * 3600_000).toISOString();
    return { t: `${iso.slice(0, 10)} ${iso.slice(11, 16)}`, value: fn(i) };
  });
}
/** Deterministic pseudo-noise in [0,1) — no Math.random so demos are stable. */
function pseudo(i: number): number {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}
/** Min/max span with a small pad, floored/ceiled — keeps card ranges honest. */
function span(points: { value: number | null }[], pad = 0.06): [number, number] {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const d = Math.max(1e-6, hi - lo) * pad;
  return [Math.floor((lo - d) * 10) / 10, Math.ceil((hi + d) * 10) / 10];
}
const SRC = 'TerraTone bundled demo';
const LICENSE = 'Bundled demo — free to use; not an official NASA product';

const TEMP_ANOMALY = [
  -0.16, -0.08, -0.10, -0.11, -0.16, -0.17, -0.21, -0.18, -0.12, -0.10,
  -0.15, -0.20, -0.11, -0.13, -0.18, -0.24, -0.21, -0.27, -0.11, -0.12,
  -0.20, -0.19, -0.12, -0.15, -0.14, -0.07, -0.12, -0.15, -0.07, -0.16,
  -0.14, -0.19, -0.17, -0.16, -0.29, -0.21, -0.21, -0.15, -0.12, -0.16,
  0.00, -0.02, -0.08, 0.01, -0.02, -0.08, -0.11, -0.10, -0.18, -0.21,
  -0.12, -0.13, -0.28, -0.27, -0.26, -0.25, -0.32, -0.31, -0.37, -0.43,
  -0.43, -0.48, -0.34, -0.16, -0.11, -0.17, -0.32, -0.19, -0.28, -0.36,
  -0.17, -0.07, -0.06, 0.02, -0.02, -0.08, 0.00, 0.03, 0.08, 0.02,
  -0.02, 0.05, 0.16, 0.07, 0.10, 0.21, 0.13, 0.05, 0.16, 0.26,
  0.32, 0.14, 0.19, 0.08, 0.19, 0.12, 0.18, 0.32, 0.39, 0.27,
  0.45, 0.40, 0.42, 0.30, 0.33, 0.46, 0.48, 0.38, 0.36, 0.40,
  0.54, 0.63, 0.45, 0.41, 0.61, 0.53, 0.54, 0.68, 0.75, 0.62,
  0.61, 0.65, 0.68, 0.66, 0.66, 0.74, 0.90, 0.92, 1.01, 0.85,
  0.98, 0.99, 1.02, 0.93, 1.01, 1.02, 1.16, 1.17, 1.21, 1.26,
  1.27, 1.31, 1.37, 1.44, 1.52, 1.47,
];

const TIDE_POINTS = subdaily('2026-03-01', 1, 336, (i) => {
  const semidiurnal = Math.sin((i / 12.42) * Math.PI * 2);
  const springNeap = 0.68 + 0.32 * Math.cos((i / (14 * 24)) * Math.PI * 2);
  return +(semidiurnal * springNeap + 0.08 * Math.sin(i * 0.9)).toFixed(2);
});
const TEMP_POINTS = annual(1880, TEMP_ANOMALY);
const CO2_POINTS = monthly(1980, 12 * 46, (i) => {
  const year = i / 12;
  return +(318 + year * 2.05 + 3.2 * Math.sin((i / 12) * Math.PI * 2) + 0.4 * Math.sin(i * 0.7)).toFixed(2);
});
const PRECIP_POINTS = monthly(2020, 60, (i) => {
  const m = i % 12;
  const wet = [20, 25, 60, 140, 260, 340, 380, 350, 280, 150, 60, 30][m];
  return Math.max(0, Math.round(wet + 30 * Math.sin(i * 1.3)));
});
const FIRE_POINTS = monthly(2021, 48, (i) => {
  const m = i % 12;
  const base = [30, 40, 90, 200, 420, 700, 820, 760, 480, 220, 80, 40][m];
  return Math.round(base * (0.8 + 0.4 * Math.abs(Math.sin(i * 0.9))));
});
const VEG_POINTS = monthly(2022, 36, (i) => {
  const m = i % 12;
  const v = [0.32, 0.34, 0.45, 0.62, 0.74, 0.8, 0.82, 0.78, 0.68, 0.52, 0.38, 0.33][m];
  return +(v + 0.02 * Math.sin(i * 2.1)).toFixed(3);
});
const SUNSPOTS = annual(1900, Array.from({ length: 126 }, (_, i) => {
  const cycle = 55 + 45 * Math.sin(((i - 3) / 10.9) * Math.PI * 2) + 15 * Math.sin(((i - 3) / 7.1) * Math.PI * 2);
  return Math.max(0, Math.round(cycle * (0.75 + 0.5 * pseudo(i))));
}));
const SEISMIC = subdaily('2026-02-11', 1, 168, (i) => {
  const background = 2.5 + 1.6 * Math.sin(i / 5) + 1.2 * Math.sin(i * 1.9 + pseudo(i) * 6);
  if (i >= 92 && i <= 96) return +(35 + 55 * pseudo(i) + (96 - Math.abs(i - 94)) * 4).toFixed(1);
  return +Math.max(0.4, background).toFixed(2);
});
const SEA_ICE = monthly(1979, 12 * 47, (i) => {
  const year = i / 12;
  const season = 4.6 * Math.cos(((i % 12) - 2) * (Math.PI / 6));
  return +(10.4 - 0.052 * year + season + 0.12 * Math.sin(i * 1.7)).toFixed(2);
});
const LIGHTNING = subdaily('2026-07-04', 1, 72, (i) => {
  const cell = Math.max(0, Math.sin(i * 0.52) * Math.sin(i * 0.17 + 2));
  const active = i > 10 && i < 46 ? 1 : 0.12;
  return Math.round(cell * cell * 170 * active * (0.6 + 0.8 * pseudo(i * 3.3)));
});
const KP = subdaily('2026-04-16', 3, 56, (i) => {
  const storm = i < 8 ? 2 : i < 14 ? 2 + (i - 8) * 1.1 : i < 26 ? 8.4 - Math.abs(14 + (i - 18) * 0.3) : Math.max(1, 8.4 - (i - 26) * 0.42);
  return +Math.min(9, Math.max(0.5, storm + 0.4 * Math.sin(i * 1.3))).toFixed(1);
});
const URBAN_HEAT = subdaily('2026-08-02', 1, 48, (i) => {
  const hour = i % 24;
  const diurnal = 0.5 * (1 + Math.cos((hour / 24) * Math.PI * 2));
  return +(1.2 + 3.9 * diurnal + 0.12 * Math.sin(i * 0.8)).toFixed(2);
});
const CORAL = monthly(2010, 12 * 16, (i) => {
  const year = i / 12;
  const season = 1.6 + 1.5 * Math.cos(((i % 12) - 2) * (Math.PI / 6));
  const heatwave = i >= 162 && i <= 171 ? 6.5 * Math.sin(((i - 162) / 9) * Math.PI) : 0;
  return +Math.max(0, season + year * 0.14 + heatwave).toFixed(2);
});
const STORM_WIND = annual(1970, Array.from({ length: 56 }, (_, i) => {
  const base = 128 + 26 * Math.sin(i / 3.1) + 34 * pseudo(i * 1.7 + 9);
  return Math.round(base + (i === 34 || i === 48 ? 34 : 0));
}));
const GLACIER_RETREAT = (() => {
  let cum = 0;
  return annual(1970, Array.from({ length: 56 }, (_, i) => {
    cum += 1.2 + 0.22 * i + 3.4 * pseudo(i * 2.1);
    return +cum.toFixed(1);
  }));
})();
const AURORA = (() => {
  // Twenty-four hours of a geomagnetic substorm seen at high latitude.
  return subdaily('2026-03-22', 1, 48, (i) => {
    const onset = i < 10 ? 8 + 4 * pseudo(i) : i < 30 ? 42 + 46 * Math.sin(((i - 10) / 20) * Math.PI) + 14 * pseudo(i) : Math.max(4, 60 - (i - 30) * 4.4);
    return Math.round(Math.max(0, onset));
  });
})();

export const SAMPLE_DATASETS: DatasetMeta[] = [
  {
    id: 'sample-global-temp',
    title: 'Global surface temperature anomaly (demo)',
    category: 'Global temperature',
    description:
      'Annual mean temperature anomaly in °C relative to a mid-20th-century baseline. ' +
      'Synthetic demonstration series with a realistic long-term warming shape. For real analysis use NASA GISTEMP via the Online tab.',
    units: '°C anomaly',
    range: span(TEMP_POINTS),
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (inspired by NASA GISTEMP)',
    sourceUrl: 'https://data.giss.nasa.gov/gistemp/',
    coverage: 'Global, 1880–2025 (annual demo points)',
    resolution: 'Annual',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: TEMP_POINTS,
    mappingNote: 'Higher anomaly → higher pitch (log scale 220–880 Hz, Musical profile snaps to pentatonic). Missing years play as silence.',
  },
  {
    id: 'sample-co2',
    title: 'Atmospheric CO₂ growth (demo)',
    category: 'Air quality and atmosphere',
    description:
      'Monthly CO₂ mixing ratio in parts per million with seasonal wobble and steady growth. ' +
      'Synthetic demo in the style of the Mauna Loa record. Fetch live context via NASA POWER.',
    units: 'ppm',
    range: span(CO2_POINTS),
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (inspired by NOAA Mauna Loa)',
    sourceUrl: 'https://gml.noaa.gov/ccgg/trends/',
    coverage: 'Single-site style series, 1980–2025 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: CO2_POINTS,
    mappingNote: 'CO₂ concentration → pitch and timbral brightness. Rising values are audible as a slow upward glide. Loudness is normalized — louder does NOT mean more dangerous unless you choose that mapping.',
  },
  {
    id: 'sample-sea-level',
    title: 'Global mean sea level (demo)',
    category: 'Sea-level change',
    description:
      'Sea-surface height anomaly in millimetres since 1993 with interannual wiggles. Synthetic demo in the style of satellite altimetry records.',
    units: 'mm',
    range: [-10, 120],
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (inspired by NASA Sea Level Change portal)',
    sourceUrl: 'https://sealevel.nasa.gov/',
    coverage: 'Global ocean, 1993–2025 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: monthly(1993, 12 * 33, (i) => {
      if (i % 37 === 0) return null; // simulated satellite gap months
      const year = i / 12;
      return +(-4 + year * 3.4 + 4 * Math.sin(i * 0.35)).toFixed(1);
    }),
    mappingNote: 'Sea-level height → pitch. Occasional missing months (satellite gaps) play as silence and are listed in the text summary.',
  },
  {
    id: 'sample-precip',
    title: 'Regional monsoon rainfall (demo)',
    category: 'Weather and precipitation',
    description:
      'Monthly rainfall totals in mm for a fictional monsoon region with strong wet/dry seasonality. Demonstrates the rhythm-density mapping.',
    units: 'mm/month',
    range: span(PRECIP_POINTS),
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (synthetic monsoon)',
    sourceUrl: 'https://power.larc.nasa.gov/',
    coverage: 'Regional demo grid cell (12°N, 78°E), 2020–2024',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: PRECIP_POINTS,
    mappingNote: 'Rainfall → note density and rhythm: dry months play sparse soft taps, monsoon months play dense bright patterns. Pitch carries the amount too.',
    frameImage: {
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      dateMode: 'exact',
      attribution: 'NASA GIBS — MODIS Terra true color (imagery © NASA)',
    },
  },
  {
    id: 'sample-fires',
    title: 'Active fire detections (demo)',
    category: 'Wildfires',
    description:
      'Monthly active-fire counts for a fictional savanna region with a dry-season burning peak. Synthetic demo for event-style sonification.',
    units: 'counts',
    range: span(FIRE_POINTS),
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (inspired by NASA FIRMS)',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
    coverage: 'Regional demo box, 2021–2024 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: FIRE_POINTS,
    mappingNote: 'Fire counts → percussive event density. Each frame emits 0–4 crackle ticks. This mapping is illustrative, not a severity scale.',
  },
  {
    id: 'sample-vegetation',
    title: 'Vegetation greenness NDVI (demo)',
    category: 'Vegetation and forests',
    description:
      'Monthly NDVI (unitless, −1…1) for a fictional temperate forest with spring green-up and autumn senescence. Synthetic demo.',
    units: 'NDVI',
    range: span(VEG_POINTS),
    provenance: 'sample',
    sourceName: 'TerraTone bundled demo (inspired by NASA MODIS/VIIRS vegetation)',
    sourceUrl: 'https://earthdata.nasa.gov/',
    coverage: 'Regional demo tile, 2022–2024 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: VEG_POINTS,
    mappingNote: 'Greenness → warm pad brightness and pitch. Seasonal cycle is audible as a yearly swell.',
    frameImage: {
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      dateMode: 'exact',
      attribution: 'NASA GIBS — MODIS Terra true color (imagery © NASA)',
    },
  },
  {
    id: 'sample-tides',
    title: 'Coastal tide gauge (demo)',
    category: 'Oceans and coasts',
    description:
      'Two weeks of hourly sea level at a fictional harbor with semidiurnal tides and a spring–neap envelope. Synthetic demo — the most musical of the set: a natural slow rhythm.',
    units: 'm above mean level',
    range: span(TIDE_POINTS),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic tide harmonics)`,
    sourceUrl: 'https://sealevel.nasa.gov/',
    coverage: 'Fictional harbor, 14 days (hourly demo points)',
    resolution: 'Hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: TIDE_POINTS,
    mappingNote: 'Water level → pitch: you hear two tide cycles a day, with spring tides (new/full moon) swelling louder. Silence-free, steady pulse — good for testing rhythm legibility.',
  },
  {
    id: 'sample-sunspots',
    title: 'Solar sunspot number (demo)',
    category: 'Sun and space weather',
    description:
      'Annual sunspot counts showing the ~11-year solar cycle from 1900 to 2025. Synthetic demo in the style of the SILSO record.',
    units: 'sunspot number',
    range: span(SUNSPOTS),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic solar cycles)`,
    sourceUrl: 'https://science.nasa.gov/sun/',
    coverage: 'Global solar disk, 1900–2025 (annual demo points)',
    resolution: 'Annual',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: SUNSPOTS,
    mappingNote: 'Activity → bright arpeggios: every solar max becomes a decade-long crescendo and every minimum a quiet valley. Cycle length is audible as tempo of the swells.',
  },
  {
    id: 'sample-seismic',
    title: 'Seismic tremor amplitude (demo)',
    category: 'Geology',
    description:
      'One week of hourly ground-motion amplitude at a fictional station, with a simulated earthquake swarm mid-week. Synthetic demo for low-frequency event listening.',
    units: 'µm/s (sim)',
    range: span(SEISMIC),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic seismogram)`,
    sourceUrl: 'https://earthquake.usgs.gov/',
    coverage: 'Fictional seismic station, 7 days (hourly demo points)',
    resolution: 'Hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: SEISMIC,
    mappingNote: 'Ground motion → deep thumps and a rising rumble; the swarm is unmistakable as a cluster of loud low hits. Background tremor stays audible as texture.',
  },
  {
    id: 'sample-sea-ice',
    title: 'Arctic sea-ice extent (demo)',
    category: 'Sea ice and polar',
    description:
      'Monthly Arctic sea-ice extent in million km², 1979–2025, with the seasonal freeze–thaw sawtooth on top of a long-term decline. Synthetic demo.',
    units: 'million km²',
    range: span(SEA_ICE),
    provenance: 'sample',
    sourceName: `${SRC} (inspired by NSIDC satellite records)`,
    sourceUrl: 'https://earthdata.nasa.gov/',
    coverage: 'Arctic Ocean, 1979–2025 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: SEA_ICE,
    mappingNote: 'Ice extent → pitch: a quick yearly up–down wobble (freeze and thaw) slowly sinking decade after decade. Listen for the seasonal rhythm riding a downward glide.',
  },
  {
    id: 'sample-lightning',
    title: 'Lightning flash rate (demo)',
    category: 'Weather and precipitation',
    description:
      '72 hours of hourly lightning counts through a fictional thunderstorm complex, with cells building and decaying. Synthetic demo for crackle-density sonification.',
    units: 'strokes/h',
    range: span(LIGHTNING),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic storm cells)`,
    sourceUrl: 'https://earthdata.nasa.gov/',
    coverage: 'Regional demo box, 3 days (hourly demo points)',
    resolution: 'Hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: LIGHTNING,
    mappingNote: 'Flash rate → crackle density: bursts sound like static storms, quiet hours breathe. Zero counts are silent frames — a lesson in how event data differs from smooth series.',
  },
  {
    id: 'sample-kp',
    title: 'Geomagnetic Kp index (demo)',
    category: 'Sun and space weather',
    description:
      'A seven-day geomagnetic storm in 3-hour Kp steps (0–9): quiet, sudden storm onset, a long main phase, then recovery. Synthetic demo.',
    units: 'Kp index',
    range: [0, 9],
    provenance: 'sample',
    sourceName: `${SRC} (synthetic space-weather storm)`,
    sourceUrl: 'https://science.nasa.gov/sun/',
    coverage: 'Planetary index, 7 days (3-hourly demo points)',
    resolution: '3-hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: KP,
    mappingNote: 'Kp → a slow eerie swell that climbs through the storm and relaxes after; the onset is a clear step up. Compare with the aurora demo for cause and effect.',
  },
  {
    id: 'sample-aurora',
    title: 'Aurora activity (demo)',
    category: 'Sun and space weather',
    description:
      'Two days of high-latitude auroral intensity shaped by a substorm onset overnight. Synthetic demo — pairs with the Kp index series.',
    units: 'relative intensity',
    range: span(AURORA),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic auroral substorm)`,
    sourceUrl: 'https://science.nasa.gov/sun/',
    coverage: 'High-latitude site, 48 hours (hourly demo points)',
    resolution: 'Hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: AURORA,
    mappingNote: 'Aurora brightness → shimmering high tones that bloom after the substorm onset and fade by dawn. Combined with the Kp demo you can hear the driver and the display.',
  },
  {
    id: 'sample-urban-heat',
    title: 'Urban heat-island intensity (demo)',
    category: 'Cities and heat',
    description:
      '48 hours of the temperature difference between a fictional city center and its rural surroundings — largest after midnight, smallest near midday. Synthetic demo.',
    units: '°C difference',
    range: span(URBAN_HEAT),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic urban diurnal cycle)`,
    sourceUrl: 'https://earthobservatory.nasa.gov/',
    coverage: 'Fictional city, 48 hours (hourly demo points)',
    resolution: 'Hourly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: URBAN_HEAT,
    mappingNote: 'Heat-island ΔT → pitch: a gentle twice-daily breathing where nights hum higher than days. Nice demonstration of a cycle hiding inside an everyday quantity.',
  },
  {
    id: 'sample-coral',
    title: 'Coral bleaching heat stress (demo)',
    category: 'Oceans and coasts',
    description:
      'Monthly degree-heating weeks (DHW) for a fictional reef, 2010–2025, including a severe marine heatwave. Synthetic demo inspired by NOAA Coral Reef Watch-style indices.',
    units: 'DHW (°C-weeks)',
    range: span(CORAL),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic degree-heating record)`,
    sourceUrl: 'https://earthobservatory.nasa.gov/',
    coverage: 'Fictional reef site, 2010–2025 (monthly demo points)',
    resolution: 'Monthly',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: CORAL,
    mappingNote: 'Heat stress → warmth-and-tension mapping: calm seasonal ticks most years, then a long dissonant swell during the heatwave. Stress above 4 DHW is conventionally bleaching territory — hear the threshold being crossed.',
  },
  {
    id: 'sample-stormwind',
    title: 'Cyclone peak wind record (demo)',
    category: 'Storms',
    description:
      'Peak sustained wind of the strongest fictional storm each year, 1970–2025, in knots. Synthetic demo for wind-roar sonification.',
    units: 'kt',
    range: span(STORM_WIND),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic storm record)`,
    sourceUrl: 'https://www.nasa.gov/earth/',
    coverage: 'Fictional basin, 1970–2025 (annual demo points)',
    resolution: 'Annual',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: STORM_WIND,
    mappingNote: 'Wind speed → roar level and pitch: most years sweep by, and the standout typhoon years hit as loud sustained blasts. Loudness stays limiter-capped — intensity is relative, not volume.',
  },
  {
    id: 'sample-glacier',
    title: 'Glacier terminus retreat (demo)',
    category: 'Cryosphere',
    description:
      'Cumulative retreat in meters of a fictional alpine glacier since 1970, with accelerating losses. Synthetic demo.',
    units: 'm cumulative retreat',
    range: span(GLACIER_RETREAT),
    provenance: 'sample',
    sourceName: `${SRC} (synthetic glacier mass balance)`,
    sourceUrl: 'https://earthdata.nasa.gov/',
    coverage: 'Fictional glacier, 1970–2025 (annual demo points)',
    resolution: 'Annual',
    license: LICENSE,
    updatedAt: '2026-01-15',
    points: GLACIER_RETREAT,
    mappingNote: 'Cumulative loss → an ever-steeper upward glide: the music accelerates because the retreat accelerates. A clean example of reading rate-of-change from sound.',
  },
];
