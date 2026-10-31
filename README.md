# TerraTone — Hear the Pulse of Our Planet

An interactive Earth-science **sonification** PWA: pick a dataset (bundled demos or live NASA data),
watch it play as a chart, and **hear the data translated into sound** — fully synchronized, fully offline-capable.

> TerraTone lives in `frontend/` as a standalone Vite + React + TypeScript app
> (no paid APIs, no account, no build-time secrets).

## Features (implemented)

- **Dashboard (Explore):** logo, connection badge (Online / Offline / Using cached data), featured datasets,
  search + category filters (only populated categories shown), recently played, how-it-works explainer, per-dataset source attribution.
- **Live NASA integrations (all keyless, documented):**
  - NASA POWER point climatology (`power.larc.nasa.gov`) → real `nasa-live` datasets with timestamps/units.
  - NASA CMR collection search → real dataset citations.
  - NASA GIBS WMTS tile-URL helper + Earth Information Center deep link (EIC has no public JSON API, so we link, never scrape/fake).
- **Visualization:** canvas time-series with playhead, legend, units, color scale, missing-data bands, timeline scrubber,
  speed control, play / pause / resume / restart / stop, date labels.
- **Sonification engine (Web Audio):** deterministic value→pitch (log scale), magnitude→safe loudness band (compressor-capped),
  precipitation-style note density, longitude→stereo pan, time→note sequence. Profiles: Musical (pentatonic), Ambient, Minimal,
  Scientific. Master volume, mute, tone preview, audio-only mode, correct node cleanup, user-gesture audio unlock.
- **Offline PWA:** `manifest.webmanifest` + hand-rolled service worker (app-shell + data caches), IndexedDB
  (datasets, experiences, settings), bundled synthetic demos on first launch, download-with-progress + cancel,
  delete, storage usage, interrupted-download tolerance, clear “cannot fetch live data offline” messaging.
- **Library:** search/filter/sort, states (downloaded / pending / failed / cancelled), offline badges.
- **Earth Jukebox Studio:** dataset → range → mapping → preview → synced play → save preset → export/share JSON;
  optional clip recording via MediaRecorder with compatibility notes.
- **Accessibility:** semantic HTML, skip link, keyboard map, visible focus, captions log per frame, text data summary,
  high-contrast theme, 4 text sizes, reduce-motion, quiet mode, color-independent status badges with honest framing
  (“sound is a companion, not a conclusion”).
- **Tornado Simulator (launched from the Sims tab):** real-time Three.js world (lazy-loaded chunk, zero impact on main bundle)
  with a controllable astronaut-like explorer (third-person camera, WASD/arrows + Shift + Space + Esc on desktop;
  joystick + drag-camera + walk/run toggle + optional gyro on mobile), rotating funnel, debris/wind particles,
  tumbling wreckage orbiting the funnel, funnel-lift that picks the explorer off the ground up close,
  a roaming funnel with a yellow catch ring (cross it to get picked up, struggle out, or get flung clear),
  trees flattened in its path and scattered bystanders (both recover),
  a rideable helicopter (hold Run to climb) and car parked by the spawn — board with E,
  both big enough to see across the map, both snatchable by the funnel like you are,
  and bystanders steal parked vehicles for joyrides (the funnel grabs those too),
  storm clouds, lightning, terrain/roads/trees/buildings with collision, wandering NPC bystanders,
  and distance rings. A fully procedural
  Web Audio storm engine (rumble + wind + whistle + gusts + thunder + debris — clearly labeled synthesized, never
  a real recording) responds continuously to character→funnel distance via a smooth non-linear curve, with
  PannerNode spatial audio + stereo fallback, limiter-capped safe output, 5 presets (Distant → Extreme + Custom),
  live waveform/spectrum from the AnalyserNode, per-layer mixer, Low/Med/High graphics, pause/resume/reset/mute,
  and an educational disclaimer. Works offline after first load (SW caches `/assets/` chunks); no NASA data needed.
- **Simulator Library (Sims tab):** the Tornado Simulator plus nine training worlds on a shared engine (generic EnvSim 3D world +
  AmbienceEngine procedural audio + pure per-hazard mappings), each with its own environment, sound design, and
  parameters — Hurricane (a drifting eye that wanders the coast — distance, audio, NPCs and the minimap all follow it;
  eyewall, rain bands, surf, storm direction, thrashing palms, flying debris, foam rings),
  Earthquake (triggered tremors, camera shake, live seismograph, magnitude/duration, swaying lamps, falling rubble,
  sparking lines), Volcano (slope-hugging lava flows, churning crater lava lake, ballistic bombs, ash column + fallout,
  steaming fumaroles, gas bursts, solid crater), Deep Ocean (diver, depth/current/temperature, bubbles, whale tone,
  current drift, live depth meter with pressure, rideable scuba sub, fish schools, patrolling sharks, pulsing
  jellyfish, passing whale, marine snow, seagrass), Wildfire (flame front, smoke/embers, dryness + wind direction,
  arcing firebrands, glowing ground embers, fleeing deer), Tsunami (advancing wave front + inland surge, spray,
  floating debris, stilt houses, ETA meter), Flash Flood (a stalled storm tops the canal levee — rainfall,
  soil intake, drainage and relief sliders; rain curtain, runoff cascades, floating debris, rising flood gauge),
  Landslide (slope, saturation, rainfall and vegetation sliders feed a live stability model — crest cracks,
  dark scar, creeping debris tongue and rolling boulders as the hillside gives), Drought (rainfall, evaporation,
  demand and capacity drain a reservoir — the water disc shrinks, mud cracks open, crops fade to straw and dust
  streams on the dry wind; reservoir meter).
  Category cards, difficulty badges, presets, launch buttons; all simulated
  values labeled, with safety guidance and offline replay. Every card carries its own hand-drawn
  procedural SVG scene — offline, no image files.
- **Optional keyed extras (online only):** APOD space photos in the Live tab
  (your key, else shared DEMO_KEY) and Gemini explanations of any sonification on Listen — always labeled
  AI-generated, never NASA data, and read aloud with the browser's built-in voice (toggleable, works offline). Keys live in <code>frontend/.env</code>
  (<code>VITE_NASA_API_KEY</code>, <code>VITE_GEMINI_API_KEY</code> — git-ignored, both verified working Oct 2026),
  with Settings → API keys as a per-device override. Rebuild after editing <code>.env</code> (values bake in at
  build time). Real keys are never committed; see <code>.env.example</code>.
- **Live tab (online hub):** real NASA EONET natural-events feed (keyless) with category filters, an interactive
  Leaflet events map, IndexedDB-cached copies for offline viewing, and one-tap launch from a live wildfire/volcano/
  storm/quake into the matching training simulator — plus EPIC Earth photos and the APOD space bonus in one place.
  New libraries: `leaflet` (+ types), code-split into its own SW-cached chunk so the main bundle stays lean.
- **Bystanders in every simulator:** wandering NPC explorers (2–6 by quality tier,
  toggleable) stroll each world while fleeing the hazard — and when you wander close they pause,
  turn your way and pop a random emote (wave, smile, thumbs-up, alert, heart) — all simulated, all offline.
- **Library thumbnails:** 17 bundled demo datasets on first launch (global temperature, CO₂, sea level,
  monsoon, fires, vegetation, tides, sunspots, seismic tremors, Arctic sea ice, lightning, Kp index,
  aurora, urban heat, coral heat stress, cyclone peak wind, glacier retreat). Every dataset card — Explore featured and Library —
  draws its own category-tinted sparkline of the real values (inline SVG, offline, DEMO-labeled for synthetic demos).
- **3D music view:** every sonification plays against a live three.js **data landscape** of the dataset
  itself — one column per (sampled) frame along the time axis, height + color = the value on a semantic
  color ramp: temperature anomalies go blue → white → red *around zero*, fires/storm winds go dark gold →
  hot red, sea level / tides / ice go deep blue → aqua, vegetation and CO₂ go dim → bright green,
  sun/space-weather records go indigo → magenta. A playhead beacon pulses on the column being played with
  a floating "time · value · units" label; each note fires a spinning shard, and the master-bus level
  gently pumps the glow. On-screen legend shows the ramp, min/max
  and honest sampling note (e.g. "1 column ≈ 7 frames"). Drag to orbit; the view follows the playhead
  while playing and slowly orbits the whole record when idle. Reduce-motion aware, WebGL-fallback safe,
  toggleable in Listen and Studio.
- **Tests:** 180 Vitest unit tests (normalization, missing/outlier handling, audio bounds, import/export, timeline sync,
  storm distance curve, level mapping, bearings, movement/collision, presets, hazard audio mappings, tremor/drift/HUD,
  flash-flood water-level model, EPIC URL builder, Gemini prompt/model/response helpers, on-device key storage,
  error-boundary recovery, EONET geometry/mapping/filtering, APOD parsing, per-sim tick modes, sub-bass curves,
  saturation curve, avatar profiles/persistence/builder, ocean depth gauge, NASA guide knowledge, NPC names,
  flash-flood model, slope-stability + reservoir-balance models, sim illustrations, dataset-sparkline art,
  bundled-demo integrity, data-landscape layout + semantic ramps, AI-voice speech cleanup,
  NPC notice/emote behavior) — all passing.
- **Talking NPCs:** walk up to any named bystander and press T (or Talk) — a speech bubble floats at their head
  (tail pointing down at them) while the quick questions and your input dock to the bottom of the view; they stop
  and turn to face you while chatting, and read their answers aloud with the browser's built-in voice (toggleable,
  click any reply to replay). Answers come through your Gemini key, grounded in NASA research notes plus the live
  sim state, with real NASA source links and honest AI labeling.
- **Character editor:** headgear (helmet/cap/bare), 3 visors + tints, 3 faces, 4 hairstyles, 5 skin tones,
  6 suits + 6 accents, 3 builds, presets + randomize, live spinning 3D preview — applied instantly in every
  simulator, saved on-device, and every NPC bystander gets its own randomized look from the same system.
- **Realistic procedural audio:** breathing sine sub-bass under every rumble, gentle saturation glue, two-stage
  thunder (close crack + rolling tail with re-strike), resonant fire/debris pops, rain patter that follows the
  rainfall slider, and pitch-dropping bubble bloops underwater — all synthesized locally, all limiter-capped.

## Quick start

```powershell
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run preview` | Serve the production build (set `PORT` as needed) |
| `npm test` | Run the unit tests once (`vitest run`) |
| `npm run desktop:dev` | Build the web app, copy it into Electron, and launch the desktop shell |
| `npm run desktop:build` | Build the Electron installer for the current OS |
| `npm run desktop:build:win` | Build the Windows NSIS installer |
| `npm run desktop:build:mac` | Build the macOS DMG (run on macOS) |
| `npm run android:sync` | Build the web app and sync it into the Android project |
| `npm run android:prepare` | First-time Android setup (build + `cap add android` + sync) |
| `npm run android:stage` | Copy built installers/APK into `downloads/` for local landing-page testing |
| `npm run ios:sync` | Build and sync into an iOS project (requires macOS/Xcode) |

## Offline verification (do this manually before release)

1. `npm run build` then serve `dist/` (e.g. `npm run preview`), open it **online**.
2. Library → **Download** a dataset; Listen → Save an experience.
3. DevTools → Application → confirm Service Worker active + IndexedDB `terratone` rows exist.
4. Go offline (DevTools Network → Offline, or airplane mode) and **reload** — shell loads from cache.
5. Replay the saved dataset/experience with sound. Success = full playback + captions with no network.

## Installers & release builds

TerraTone ships three native install paths plus the browser PWA:

| Target | Artifact | Built with |
|---|---|---|
| Windows | `TerraTone-Windows-Setup.exe` | Electron 45 (NSIS) |
| macOS | `TerraTone-macOS.dmg` | Electron 45 (universal DMG) |
| Android | `TerraTone-Android.apk` | Capacitor 8 (debug APK) |
| iPhone / iPad | Add to Home Screen | PWA (an IPA needs Apple signing) |

The landing page resolves each button in this order:

1. A platform-specific `VITE_INSTALLER_*` URL, if set.
2. The stable GitHub release asset from `VITE_GITHUB_REPO`, if set.
3. The browser PWA install flow.

iPhone/iPad use `VITE_INSTALLER_IOS` only (signed IPA or TestFlight link); without it they
get Add to Home Screen instructions instead of an Android APK.

After the intro, the landing page is shown in the browser and in native shells. Inside an
installed app the primary action reads “Enter TerraTone” and the installer cards are hidden.

### Local builds

```powershell
npm run desktop:dev      # build web + launch Electron
npm run desktop:build    # installer for the current OS
npm run desktop:build:win
npm run desktop:build:mac   # run on macOS
npm run android:sync     # build web + copy into android/
```

The `android/` project is committed. Open it in Android Studio, or build the APK with:

```powershell
cd android
.\gradlew assembleDebug
cd ..
npm run android:stage    # copy the APK into downloads/ for the landing page
```

Desktop builds only need Node 24 + npm; Electron and electron-builder are installed
under `electron/`. Windows installers must be built on Windows, and macOS DMGs on macOS.
Local Android builds need JDK 21 and the Android SDK (platform 36). The CI workflow
installs these automatically.

To test the landing-page download buttons locally:

```powershell
npm run desktop:build:win
# electron/release/TerraTone-Windows-Setup.exe is copied to downloads/
# .env.local sets VITE_INSTALLER_WINDOWS=/downloads/TerraTone-Windows-Setup.exe
npm run dev
```

The Vite dev/preview server streams files from `downloads/`; that folder is git-ignored.
For Android, build the APK, run `npm run android:stage`, then add
`VITE_INSTALLER_PHONE=/downloads/TerraTone-Android.apk` to `.env.local` and restart Vite.
For macOS, build on a Mac and add `VITE_INSTALLER_MAC=/downloads/TerraTone-macOS.dmg`.

### Publish installers

1. Push `frontend/` to a public GitHub repository (release downloads are unauthenticated).
   The workflow lives in `frontend/.github/`, so this assumes `frontend/` is the repository root.
   For a monorepo, move `.github/workflows/release.yml` to the root and run the steps with
   `working-directory: frontend`.
2. Set `VITE_GITHUB_REPO=owner/repo` in the environment used to build/deploy the web app
   (for local testing, put it in `.env.local` and rebuild).
3. Push a tag such as `v1.0.0` (or run **Build installers** manually).
4. `.github/workflows/release.yml` builds Windows, macOS, and Android artifacts and attaches
   them to the GitHub release with the stable names above.

The APK is debug-signed so it can be installed directly (enable "install unknown apps").
For Play Store distribution, add a release keystore and build `assembleRelease`.
The Windows and macOS builds are unsigned for now, so SmartScreen/Gatekeeper may ask you to
confirm the app the first time. Code-signing secrets can be added to the workflow later.
iOS distribution requires an Apple Developer account; set `VITE_INSTALLER_IOS` to a signed
IPA/TestFlight URL if you have one, otherwise iPhone users get Add to Home Screen instructions.

### Browser PWA install

1. Host `dist/` over **HTTPS** (required for PWA install + service worker).
2. Open in Chrome, Edge, or Safari and use the browser install / Add to Dock / Add to Home Screen action.
3. The PWA keeps working offline after the first visit.

## Configuration

Copy `.env.example` to `.env` — everything is optional; core features need no keys:

- `VITE_POWER_BASE` — NASA POWER API base (default `https://power.larc.nasa.gov/api`)
- `VITE_GIBS_BASE` — GIBS WMTS base for imagery backdrops

Never put secrets in frontend code; none are required.

Installer-related build variables:

- `VITE_GITHUB_REPO` — `owner/repo`; enables stable GitHub release download URLs.
- `VITE_INSTALLER_WINDOWS`, `VITE_INSTALLER_MAC`, `VITE_INSTALLER_PHONE`, `VITE_INSTALLER_IOS` — optional direct URLs that override the GitHub assets.

## Project layout

```
frontend/
  index.html  public/{manifest.webmanifest, sw.js, icons/}
  electron/{main.cjs, package.json, build/}  # desktop shell + installer config
  scripts/{prepare-android,stage-installers}.mjs
  src/
    types.ts  styles.css  App.tsx  main.tsx
    audio/engine.ts + audio/stormEngine.ts  # dataset sonification + procedural storm soundscape
    audio/ambience.ts          # generic procedural environment audio (5 hazard sims)
    data/samples.ts            # 17 bundled SYNTHETIC demos (provenance: sample)
    lib/{dataUtils,nasa,db}.ts # math helpers / NASA clients / IndexedDB
    sim/{stormTypes,TornadoScene}.ts  # pure storm math/presets + Three.js world (lazy chunk)
    sim/{hazards,EnvSim}.ts    # hazard registry/params/mappings + shared 3D world engine
    sim/packs/{hurricane,earthquake,volcano,ocean,wildfire,tsunami,flood}.ts  # distinct environments
    store/AppContext.tsx       # datasets, downloads, settings, connection
    components/{Bits,TimeChart,Player,TornadoViewport,StormAudioPanel}.tsx
    components/{SimViewport,HazardAudioPanel,AudioViz,SeismicPanel,SimArt,DataArt,MusicViz3D}.tsx
    pages/{Explore,Listen,Storm(Tornado),Sims(library),HazardSim,Library,Studio,Access,Settings,Online}.tsx
    tests/{terratone,tornado,hazards}.test.ts
```

## Known limitations / remaining tasks

- Live values currently come from NASA POWER point climatology; gridded fields (GISTEMP maps, MODIS tiles rendering,
  FIRMS fire polygons) are cited/linked but not yet raster-rendered — GIBS layer helper is ready for that.
- Studio time-range applies to saved presets/exports; the live player run uses the full series (noted in UI).
- Recording output format depends on the browser (`audio/webm;codecs=opus` preferred; Safari limited).
- No backend: sharing = JSON file exchange; no cloud sync by design (privacy).
- E2E (Playwright) + service-worker cache tests are documented but not yet automated — unit + manual offline pass cover it.
