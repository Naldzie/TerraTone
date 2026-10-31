# TerraTone Upgrade Plan — Earth Science Laboratory

Master implementation plan for the next-generation upgrade (10 new simulation worlds, Earth Observatory,
Data Laboratory, Academy, expanded sonification, optional scientific libraries) while preserving every
existing feature. Phases follow the master prompt's structure. Progress log at the bottom.

Status legend: `[x] done` · `[~] in progress` · `[ ] planned` · `[-] deferred/conditional`

---

## 1. Repository audit (Phase 1 — done)

Stack: Vite 8 + React 19 + TypeScript 5.9 (strict) + Three.js 0.186 + Leaflet 1.9 + Web Audio +
IndexedDB + hand-rolled service worker + Vitest 5 (jsdom). App lives in `frontend/`; the Laravel
skeleton at repo root is untouched.

Baseline verified (this pass): `npx tsc --noEmit` clean, `npx vitest run` 95/95 green, `npm run build` OK.

Key architecture (everything reusable for the new worlds):

| Layer | File(s) | Role |
|---|---|---|
| Hazard registry | `sim/hazards.ts` | `HazardDef`: params, presets, audio layers, pure gain/tone/boom/tick/sub mappings, HUD, gauges, safety/edu copy. `HazardId` union; `clampVals`. |
| World engine | `sim/EnvSim.ts` | Renderer, follow camera, player, input (desktop + touch + gyro), collisions, quality tiers, NPC integration, minimap events, `FeatureCtx` (`scene`, `rand`, `addCollider`, `setHazard`, `quality`, `reduceMotion`). |
| Environment packs | `sim/packs/*.ts` | One `feature(ctx)` builder + `palette` per world (procedural geometry only — offline-safe). |
| Audio | `audio/ambience.ts`, `audio/realism.ts` | Generic layered noise engine driven by registry gains/freqs + sub-bass/saturation/thunder helpers. |
| Page wiring | `pages/Sims.tsx` → `pages/HazardSim.tsx` | Sims page renders `HAZARDS` generically; `HazardSim` maps id → pack (`PACKS`), minimap event (`HAZARD_EVENT`), audio, HUD, guide topic. |
| NPC guides | `lib/nasaGuide.ts`, `components/NpcChat.tsx` | Topic-grounded facts + sources; chat via optional Gemini key. |
| Minimap | `components/Minimap.tsx` | Event kinds rendered per sim. |
| Live events | `lib/eonet.ts` | `categoryToSim` maps EONET categories to sim ids. |
| Tests | `tests/hazards.test.ts` etc. | Generic per-hazard constraints loop over `HAZARDS` — new worlds are auto-covered. |

Adding a world touches: `HazardId` union + def in `hazards.ts`, a new `packs/<id>.ts`, `PACKS` +
`HAZARD_EVENT` in `HazardSim.tsx`, optional `Minimap` kind, a guide topic, and small test updates
(registry id list, guide topic list). That is the pipeline used for all ten new worlds.

## 2. Dependency evaluation (Phase 2)

Policy: install a library only in the phase that consumes it, with a test; prefer tree-shaken/deep
imports; prefer lazy `import()` for heavy modules; keep `three` the only 3D engine for hazard worlds.

| Library | Verdict | Where / why | Bundle notes |
|---|---|---|---|
| d3 | ADOPT (subset `d3-scale`, `d3-array`, `d3-interpolate`, `d3-geo`) | Data Lab scales/colors/colormaps; interactive chart math shared with ECharts | Small when sub-imported |
| Apache ECharts | ADOPT (lazy) | Data Lab dashboards: heatmaps, multi-series comparisons; virtualized import via `echarts/core` | Code-split chunk, loaded on demand |
| CesiumJS | CONDITIONAL (lazy) | Observatory globe/terrain *only if* a terrain/imagery source is configured; graceful fallback to Leaflet + message | Very heavy — never on initial screen; feature-detected |
| satellite.js | ADOPT (lazy) | Observatory satellite ground tracks from TLEs; offline sample TLEs clearly labeled, no fake "live" tracks | Small |
| proj4 | ADOPT | Coordinate display & conversions (WGS84/WebMercator/UTM) in Observatory + Data Lab | Small |
| @turf/turf | ADOPT (deep imports) | Geospatial measures/buffers/centroids for Data Lab + EONET analyses | Use per-function imports |
| geotiff | ADOPT (lazy) | GeoTIFF elevation/raster import in Data Lab; same 512 KB / caps policy, explicit errors | Heavy-ish; web worker or lazy chunk |
| papaparse | ADOPT | CSV import engine behind the existing validator (keeps caps + row errors) | Small |
| zod | ADOPT | Schema validation for imported JSON, share payloads, saved experiments/presets (versioned) | Small |
| lz-string | ADOPT | Compress share/export payloads + IndexedDB experiment blobs; versioned envelope | Tiny |
| @tanstack/react-virtual | ADOPT | Long lists (Library, Data Lab, EONET feed) | Tiny |
| @playwright/test | ADOPT (dev) | Browser smoke tests: navigation, sim launch, offline reload; local script only | Dev-only |

Rationale for D3 + ECharts split: D3 provides scales/colormaps/geometry used by both React and canvas
code; ECharts provides composed interactive dashboards. Neither replaces the existing hand-rolled
`TimeChart`/`AudioViz` 3D-first charts — those stay.

### 2b. Audio & music libraries (10 evaluated — Phases 5–7)

Same policy: installed only alongside a real, tested consumer. The hand-rolled Web Audio engines
stay the sonic backbone; these extend it rather than replace it.

| Library | Verdict | Where / why |
|---|---|---|
| tonal | ADOPT | Scale/chord/note math for the Musical profile + Academy theory (pure, tiny) |
| @tonejs/midi | ADOPT | Export sonified experiments & Jukebox presets as .mid files (offline) |
| meyda | ADOPT (lazy) | Spectral features (loudness/centroid) for AudioViz + Academy grading |
| wavesurfer.js | ADOPT (lazy) | Waveform review of MediaRecorder clips in the Studio |
| fft.js | ADOPT (lazy) | Fast FFT for a higher-detail spectrogram view |
| abcjs | ADOPT (lazy) | Music-notation rendering for Academy lessons / Studio ear-training |
| tone | CONDITIONAL (lazy) | Full synthesis framework — only if Academy needs richer voices; would duplicate existing engine otherwise |
| soundfont-player | CONDITIONAL | Instrument voices — requires bundling soundfonts for offline; skipped if size budget fails |
| howler.js | DECLINE | Duplicates the Web Audio engine; the app plays no audio files |
| standardized-audio-context | DECLINE | Polyfill superseded by feature guards on modern targets |

## 2c. Visual identity: generated art

- `components/SimArt.tsx`: eight hand-drawn inline-SVG scenes (tornado + seven hazards) shown on
  Simulator Library cards. Offline-safe, no image files, no trademarks; each uses its sim's accent
  color so cards, minimap markers, and HUD feel related. Scenes carry screen-reader labels.
- `components/DataArt.tsx`: per-dataset sparkline thumbnails (Explore featured cards + Library cards).
  Category-hashed hue, real values drawn with null-gaps preserved, DEMO-labeled for synthetic demos.
  Pure geometry (`sparkGeometry`) so it is unit-testable.
- Correction (Oct 2026): the earlier "Stack page / LibBadge" library-credits page was removed at the
  user's request — navigation stays focused on product surfaces; library reasoning lives in this file.

## 3. Ten new simulation worlds (Phase 3)

All use `EnvSim` + `AmbienceEngine` + registry unless noted. Each ships: ≥3 params, ≥3 presets,
play/pause/reset, camera, HUD, gauges, audio profile, mobile controls, REAL DATA / SIMULATED /
ILLUSTRATIVE MODEL tag, safety/edu copy, unit tests.

| # | World | Model (illustrative) | Key params | Signature visuals / audio | Status |
|---|---|---|---|---|---|
| A | Flash Flood (`flood`) | Rainfall → infiltration → runoff → drainage retention → water level (pure `floodLevel`) | rainfall mm/h, soil intake, drainage, terrain relief | Levees + canal, rain curtain, runoff cascades, overflow sheet, floating debris, depth markers; rain hiss + runoff + surge sub | **[x] shipped this pass** |
| B | Landslide (`landslide`) | Slope stability index (slope, saturation, cohesion) thresholds → slide event | slope °, soil saturation, rainfall, vegetation | Hillside terraces, scarp, debris tongue, dust puffs; crack/rumble/debris pops | **[x] shipped (Pass 4)** |
| C | Drought & Water Crisis (`drought`) | Deficit = demand − (rain + reservoir stock − evaporation) over time; reservoir curve | rainfall deficit, evaporation, reservoir cap, crop demand | Cracked earth, dropping reservoir shorelines, stressed crops; dry wind + ticks | **[x] shipped (Pass 4)** |
| D | Solar Storm & Aurora (`aurora`) | Kp index from solar wind speed/density/Bz (documented illustrative formula) | solar wind, density, Bz, storm phase | Aurora curtains, magnetic field lines, satellite glint outages; ionospheric sweep tones | [ ] |
| E | Asteroid Impact (`impact`) | Kinetic energy ½mv² with documented assumptions; crater scaling references | diameter, density, velocity, angle | Atmospheric entry streak, crater formation, ejecta; shock rumble + debris | [ ] |
| F | Glacier & Sea Level (`glacier`) | Simplified mass-balance (temp anomaly × ice area); land ice vs sea ice separated | temperature anomaly, ice loss rate, meltwater routing | Retreating glacier, moraine, iceberg calving, coast flood vignette; meltwater + ice cracks | [ ] |
| G | Coral Reef (`reef`) | Degree-heating weeks + acidification stress → bleaching/recovery state machine | sea temp, acidity, stress duration | Reef terraces, coral color state, fish populations; warm-water murmur + bloop | [ ] |
| H | Air Quality (`air`) | Gaussian-plume-style dispersion w/ wind + mixing height (illustrative) | PM2.5 emission, wind speed, wind direction, mixing height | Smog sheet, drifting particles, AQI gauge, map overlay; low wash + hiss | [ ] |
| I | Watershed & Rivers (`watershed`) | Catchment runoff routing along river graph (same flood core, river network) | soil type, rainfall, land cover, river level | Catchment outline, tributary streams, river-stage gauges; stream/rapids audio | [ ] |
| J | Solar System Orbits (`orbits`) | Keplerian two-body w/ documented elements; optional satellite.js reuse for Earth-orbit demo | time acceleration, orbit eccentricity, planet selector | Sun + planets + trails, eclipse alignment demo, orbit HUD; harmonic orbital tones | [ ] |

World E/F/G/H/J may be Three.js scenes that reuse EnvSim *or* a light non-walkable variant if the
educational model reads better from a fixed camera; decision per world, documented when built.

## 4. Interactive 3D Earth Observatory (Phase 4a)

- New page + nav entry; Leaflet EONET map stays for lightweight use.
- Navigable globe (Cesium lazy-loaded) with terrain/elevation **only when configured**; otherwise
  a clear "terrain source unavailable" state (never imply missing layers exist).
- Coordinate readout (proj4), EONET markers + category filters + time range playback, event detail
  panel with attribution (reuses `lib/eonet.ts` + cache), satellite ground tracks (satellite.js,
  TLE from user-provided file or bundled labeled sample), dataset overlays for supported sources.
- Comparison mode only for datasets actually loadable; legend units surfaced from dataset metadata.

## 5. Scientific Data Laboratory (Phase 4b)

- Comparison workspace: multi-series overlays, date-range selection, missing-data/outlier views,
  unit conversion where valid, descriptive stats/trends (no causal claims).
- Imports: existing CSV/JSON + GeoTIFF (lazy) with zod-schema validation and row-level errors;
  papaparse engine swap behind current caps (512 KB / 5,000 points) + tests.
- Storage: download progress/cancel/retry, quota display; exports (chart PNG, summary JSON,
  experiment config) with lz-string compression + version field.

## 6. Sonification & Studio upgrade (Phase 5a)

- Multi-dataset sync playback, per-variable mapping to pitch/rhythm/timbre/volume/pan.
- Custom sound profiles, waveform + spectrum already exist (`AudioViz`) — reuse in Studio.
- Loop regions, speed, scrub (reuse `Player` timeline), captions track (extend caption log),
  preset save/duplicate/import/export/share (zod + lz-string envelopes).
- Limiter-capped output and teardown rules unchanged; mapping explainer added to UI.

## 7. Earth Science Academy (Phase 5b)

- Local-first (IndexedDB): guided lessons per sim, missions using existing presets, quizzes,
  glossary, achievements, source citations; no accounts, no certificates, accessible layout.

## 8. AI guides + NPC coverage (Phase 5c)

- Add guide topics for every new world (NASA-grounded facts + program-level source URLs only).
- NPC prompts keep live-sim context; offline fallback = curated facts; AI labeled; keys optional
  (`.env` only after the Settings keys UI removal) — no key/no network ⇒ graceful disabled state.

## 9. Performance, mobile, offline (Phase 6)

- Every new sim behind dynamic `import()` (same as tornado); initial bundle stays lean.
- Quality tiers honored in all packs (particle counts scale), instancing/pooling for repeated meshes,
  DPR clamp, pause when hidden, full dispose of geometries/materials/listeners/audio nodes.
- Non-WebGL fallback = educational cards/charts for each world; reduced-motion respected.
- Service worker: keep versioned cache names; only cache public/static data; never cache keyed API
  responses; offline copy stays explicitly "not fresh NASA data".

## 10. Testing & verification (Phase 7, continuous)

- Keep generic registry tests auto-covering every new hazard; add per-world pure-model tests
  (e.g. `floodLevel`, stability index, energy formula, Kp mapping) and state-transition tests.
- Add papaparse/zod/lz-string round-trip tests; observatory fallback tests; playwright smoke later.
- Every phase ends with `npx tsc --noEmit`, `npx vitest run`, `npm run build` before reporting.
- Never delete tests to pass; update expectations only where behavior intentionally changes.

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Cesium/ECharts weight | Lazy chunks, feature flags, offline fallback messages |
| New worlds multiplying engine changes | Registry-driven packs, no per-world engine forks |
| GeoTIFF memory blowups | Strict caps + lazy import + explicit errors |
| E2E flake on CI-less machine | Playwright local-only smoke, retries off, documented |
| Docs drift ("six sims") | Update README/details.docs in every phase that changes counts |
| Honesty labeling erosion | REAL DATA / SIMULATED / ILLUSTRATIVE badges on every world + guide rules |

## 12. Progress log

### Pass 1 (this pass) — Phase 1 complete + first Phase 3 world
- [x] Baseline: tsc clean, 95/95 tests, build OK.
- [x] This plan; dependency verdicts recorded.
- [x] **Flash Flood Simulator** shipped end-to-end on the shared engine:
  - `src/sim/packs/flood.ts` (new), pure `floodLevel` model exported from `hazards.ts`.
  - Registry: `HazardId` + `HazardDef` (4 params, 3 presets, 4 audio layers, HUD, gauge, safety/edu).
  - Wiring: `HazardSim` pack map + minimap event (`gauge` kind), EONET `floods → flood` launch.
  - Guide: NASA-grounded `flood` topic (GPM/Earthdata), NPCs cover the new world.
  - Tests: registry + guide lists extended; new `tests/flood.test.ts` for the water-level model.
- [x] Verified after change: `tsc` clean, **103/103 tests (9 files)**, production build OK
  (flood stays inside the lazy Sims chunk; initial bundle unchanged). EONET `floods` events now
  launch the flood sim (`categoryToSim` test updated deliberately).
- Next pass: Landslide + Drought packs; then first library installs that have consumers
  (papaparse + zod + lz-string) with round-trip tests.

### Pass 2 — 10 music/audio libraries evaluated + procedural art
- [x] Audio & music shortlist added to the evaluation table (§2b): 6 adopt, 2 conditional, 2 declined —
  no installs yet by policy (consumers come in Phase 5). Parked reference only: a later clarification
  showed the "library music" request meant bundled demo *datasets*, not npm audio packages.
- [x] Procedural SVG art for every sim (`SimArt`, 8 scenes) wired into all Simulator Library cards.
- [x] (Removed in Pass 3) **Stack** page (`pages/Stack.tsx` + `LibBadge`) — built on a misreading of
  the request; deleted with its nav entry, CSS, and tests.
- [x] Tests: `tests/art.test.tsx` (scene coverage) — suite was **108/108 across 10 files** at the time;
  tsc clean; production build OK (art ships inside the lazy Sims chunk).

### Pass 3 — Library demo expansion + dataset thumbnails (user-corrected scope)
- [x] Removed the Stack page completely: nav entry, `TabId`, `pages/Stack.tsx`, `components/LibBadge.tsx`,
  CSS block, and its tests; docs updated. `SimArt` sim illustrations kept (they were the real ask for sims).
- [x] `src/data/samples.ts`: grew from 6 → **17 bundled demo datasets** — added tides, sunspots, seismic
  tremor, Arctic sea ice, lightning flash rate, geomagnetic Kp, aurora activity, urban heat island,
  coral heat stress, cyclone peak wind, glacier retreat (all `provenance:"sample"`, honest source labels,
  deterministic generated series). Fixed a duplicate `sample-precip` id (silently shadowed by the store's
  by-id dedupe) and replaced the display-only hand-authored ranges with computed `span()` values so the
  range-honesty test holds for every demo.
- [x] `components/DataArt.tsx`: category-hashed sparkline thumbnails on every dataset card
  (Explore featured + Library); gap-aware line/area geometry, DEMO tag on synthetic series.
- [x] Tests: art suite reworked — SimArt kept, LibBadge tests removed, new dataset-art tests
  (renders for all demos, hue determinism, null-gap drawing, ≥16 distinct demos, labels + range honesty).
- [x] 3D music view (`components/MusicViz3D.tsx`): lazy three.js scene with spectrum ring (post-master
  `AnalyserNode` tap on the engine), note fountain (engine `onNote` event bus), beaded 3D data ribbon +
  playhead column; honest idle pitch-palette mode; reduce-motion + WebGL fallback; toggle in Player
  (default on in Listen, off in Studio compact). Pure geometry helpers unit-tested (`tests/musicviz.test.ts`).
- [x] Visual polish pass ("make it good"): bloom post-processing (EffectComposer + UnrealBloomPass +
  OutputPass, RMS-pumped in live mode), tapered bars + framing torus, beaded ribbon (line kept as a
  subtle additive underline), spinning shards, glow disc backdrop, starfield, reflective floor, and a
  damped drag-to-orbit camera with slow cinematic auto-orbit. Frame loop avoids per-frame allocations in
  hot paths (reused tmp colors/vectors).
- [x] Data-landscape rebuild (user clarification: the 3D view must show *what the data is*): one column
  per sampled frame (≤150, honest subsampling note), semantic per-dataset color ramps
  (`rampForDataset`: temperature diverging centered at 0, water/ice cool, fire/storm warm, vegetation/CO₂
  green, space weather violet), playhead column pulse + floor ring + beacon + beam + floating
  "time · value · units" canvas label, camera follows the playhead during playback, on-screen legend
  (gradient, min/max, sampling note). New tested helpers: `columnPlan`, `columnFrame`, `rampForDataset`,
  `rampColor`, `rampCss`, `rampLabel`, `colorT`.
- [x] Bundle accounting for the 3D view: MusicViz3D chunk is 32.2 kB raw / 10.2 kB gzip (includes the
  bloom passes), loaded only when toggled. Measured note: three.js was already in the eager chunk graph
  before this pass (entry chunk gzip ≈ 172 kB contained it); after the new dynamic consumer it
  repackaged into a shared chunk — total eager gzip moved from ≈229 kB to ≈238 kB, so no lazy-vs-eager
  regression from this feature.
- [x] Verified: `tsc` clean, **119/119 tests (11 files)**, production build OK.

### Pass 4 — Landslide + Drought worlds (Phase 3, worlds B & C)
- [x] **Landslide Simulator** (`landslide`): pure `slopeStability` model (slope × pore-water pressure
  vs friction + root cohesion; unit-tested monotonic/bounded/non-finite-safe); registry def (4 params,
  3 presets, 4 layers, 'pop' debris ticks, slope-stability gauge, safety/edu copy); `packs/landslide.ts`
  (terraced hillside, dark scarp, crest cracks that open with instability, creeping debris tongue,
  boulders that roll at failure, dust puffs, rain curtain, survey staff); SimArt scene; guide topic;
  EONET `landslides` launch mapping; minimap `scarp` event.
- [x] **Drought Simulator** (`drought`): pure `reservoirLevel` model (rainfall in vs evaporation +
  demand out, buffered by capacity; unit-tested); registry def (4 params, 3 presets, 3 layers,
  cracking-mud ticks, reservoir gauge); `packs/drought.ts` (basin + shrinking/dropping water disc,
  historic shoreline bands, radial mud cracks and pits on the drying bed, crops fading green → straw,
  evaporation-scaled dust, rim houses with colliders); SimArt scene; guide topic (GRACE-FO / SMAP);
  EONET `drought` launch mapping; minimap `reservoir` event.
- [x] Tests: registry id order + guide topic lists extended; new `tests/landslide.test.ts` +
  `tests/drought.test.ts`; EONET mapping test updated deliberately (drought now launches a sim,
  unknown categories still null).
- [x] Verified: `tsc` clean, **135/135 tests (13 files)**, production build OK — Sims lazy chunk
  (all nine hazard worlds + engine) is 95.4 kB raw / 30.9 kB gzip, still loaded only on demand.

### Pass 5 — 3D view decluttered + AI explanation voice (user requests)
- [x] **Removed the spectrum ring from the 3D music view** (user: "remove the circle 3d"): ring
  geometry, FFT bars and idle pitch-palette logic deleted; obsolete pure helpers (`freqToY`,
  `sampleWindow`, `pitchPalette`) and their tests removed with it. Master-bus RMS still pumps bloom,
  beacon scale and the playhead pulse. Chunk shrank 32.2 → 30.5 kB raw (9.6 kB gzip).
- [x] **AI explanation voice** (user: "add voice when ai explaining the sound"): `AiExplain` now reads
  Gemini answers aloud with the browser's built-in SpeechSynthesis — persisted voice on/off toggle,
  read-aloud/stop button on the answer, speech canceled on new requests/unmount; helpers extracted to
  shared `lib/tts.ts` (NpcChat refactored onto it).
- [x] Tests: musicviz suite trimmed (ring-only helpers gone), new `tests/tts.test.ts` (markdown/link
  speech cleanup, availability).
- [x] Verified: `tsc` clean, **133/133 tests (14 files)**, production build OK — MusicViz3D lazy chunk
  is 30.5 kB raw / 9.6 kB gzip; Sims chunk unchanged at 95.4 kB raw / 30.9 kB gzip.

### Pass 6 — NPC notice emotes (user request)
- [x] **Bystanders emote when you approach** (user: "make the npc randomly emote when they see me or
  approach me"): shared `Npc` now takes the player position in `update`, and within ~24 m each
  bystander may notice the visitor — pause a beat, turn to face them, then pop a weighted random
  emote bubble (👋 😄 👍 ❗ ❤️) rendered as a canvas emoji sprite above the head; pop-in/bob/fade,
  a little hop + arm wave for 👋 when standing. Deterministic per seed (new `noticeChance`
  personality 45–100%), 5–14 s retry glances, 18–44 s cooldown, cancelled while fleeing or chatting,
  re-armed on respawn. Works in all nine EnvSim worlds + TornadoScene.
- [x] Tests: new `tests/npc.test.ts` — weighted deterministic `pickEmote`, approaches trigger an
  emote per seed, never while fleeing, cancelled by chat.
- [x] Verified: `tsc` clean, **137/137 tests (15 files)**, production build OK — Sims chunk 95.46 kB
  raw / 30.9 kB gzip (emote code included, still lazy).
