import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings, DatasetMeta, Experience, MappingConfig } from '../types';
import type { HazardId } from '../sim/hazards';
import type { AvatarOptions } from '../sim/avatar';
import { loadAvatar, saveAvatar } from '../sim/avatar';
import { SAMPLE_DATASETS } from '../data/samples';
import { DEFAULT_INSTRUMENT_ID, DEFAULT_PROFILE_ID } from '../audio/instrumentProfiles';
import { db } from '../lib/db';
import {
  introFrequencyChosen,
  loadStartupPrefs,
  markIntroFrequencyChosen,
  resetIntroSeen,
  saveStartupPrefs,
} from '../lib/intro';

export type ConnectionState = 'online' | 'offline' | 'cached';
export type TabId = 'explore' | 'listen' | 'storm' | 'sims' | 'library' | 'studio' |
'access' | 'settings' | 'online';

interface AppState {
  tab: TabId;
  setTab: (t: TabId) => void;
  /** Deep link into a simulator (consumed once by the Sims tab). */
  simTarget: HazardId | null;
  requestSim: (id: HazardId) => void;
  clearSimTarget: () => void;
  settings: AppSettings;
  updateSettings: (p: Partial<AppSettings>) => void;
  /** Explorer appearance profile (persisted on-device). */
  avatar: AvatarOptions;
  setAvatarProfile: (o: AvatarOptions) => void;
  /** Profile menu (Explorer look + wardrobe) visibility. */
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  connection: ConnectionState;
  usingCached: boolean;
  datasets: DatasetMeta[]; // samples + downloaded + live-fetched (session)
  downloadedIds: Set<string>;
  downloading: Record<string, number>; // id -> 0..1 progress
  recent: Experience[];
  experiences: Experience[];
  currentDatasetId: string;
  currentDataset: DatasetMeta | undefined;
  selectDataset: (id: string) => void;
  mapping: MappingConfig;
  updateMapping: (p: Partial<MappingConfig>) => void;
  saveDataset: (d: DatasetMeta) => Promise<void>;
  removeDataset: (id: string) => Promise<void>;
  cancelDownload: (id: string) => void;
  saveExperience: (name: string) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  storage: { usedMB: number; quotaMB: number };
}

const DEFAULTS: AppSettings = {
  volume: 0.7, speed: 4, profileId: 'musical',
  highContrast: false, reduceMotion: false, textScale: 1, disableNonessentialSound: false,
  introEnabled: true, introFrequency: 'every',
};

function initialSettings(): AppSettings {
  const mirrored = loadStartupPrefs();
  const frequency = introFrequencyChosen() ? mirrored.frequency : 'every';
  return {
    ...DEFAULTS,
    ...(typeof mirrored.enabled === 'boolean' ? { introEnabled: mirrored.enabled } : {}),
    ...(frequency ? { introFrequency: frequency } : {}),
    ...(typeof mirrored.quiet === 'boolean' ? { disableNonessentialSound: mirrored.quiet } : {}),
    ...(typeof mirrored.volume === 'number' ? { volume: mirrored.volume } : {}),
  };
}

/**
 * Keep the launch-time mirror in sync with the full settings.
 * The intro decides whether it may play — and how loud — before IndexedDB has
 * answered, so these few values are duplicated into localStorage.
 */
function mirrorStartupPrefs(s: AppSettings): void {
  saveStartupPrefs({
    enabled: s.introEnabled,
    frequency: s.introFrequency,
    quiet: s.disableNonessentialSound,
    volume: s.volume,
  });
}

const Ctx = createContext<AppState | null>(null);

function mergeDatasets(session: DatasetMeta[], downloaded: DatasetMeta[]): DatasetMeta[] {
  const byId = new Map<string, DatasetMeta>();
  for (const d of SAMPLE_DATASETS) byId.set(d.id, d);
  for (const d of downloaded) byId.set(d.id, d);
  for (const d of session) byId.set(d.id, d.provenance === 'nasa-live' ? d : { ...d });
  return [...byId.values()];
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabId>('explore');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const settingsRef = useRef<AppSettings>(settings);
  const [avatar, setAvatarState] = useState<AvatarOptions>(loadAvatar);
  const [profileOpen, setProfileOpen] = useState(false);
  const [navigatorOnline, setNavigatorOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [sessionDatasets, setSessionDatasets] = useState<DatasetMeta[]>([]);
  const [downloaded, setDownloaded] = useState<DatasetMeta[]>([]);
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [currentDatasetId, setCurrentDatasetId] = useState(SAMPLE_DATASETS[0].id);
  const [simTarget, setSimTarget] = useState<HazardId | null>(null);

  const requestSim = useCallback((id: HazardId) => {
    setSimTarget(id);
    setTab('sims');
  }, []);

  const clearSimTarget = useCallback(() => setSimTarget(null), []);
  const [storage, setStorage] = useState({ usedMB: 0, quotaMB: 0 });
  const cancelFlags = useRef<Record<string, boolean>>({});

  const refreshLibrary = useCallback(async () => {
    try {
      const [ds, ex] = await Promise.all([db.listDatasets(), db.listExperiences()]);
      setDownloaded(ds);
      setExperiences(ex.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt)));
      try {
        const est = await navigator.storage.estimate();
        setStorage({
          usedMB: +(((est.usage ?? 0) / 1048576).toFixed(2)),
          quotaMB: +(((est.quota ?? 0) / 1048576).toFixed(1)),
        });
      } catch { /* noop */ }
      const saved = await db.getKv<Partial<AppSettings>>('settings');
      if (saved) {
        const merged = { ...settingsRef.current, ...saved };
        if (!introFrequencyChosen()) merged.introFrequency = 'every';
        settingsRef.current = merged;
        setSettings(merged);
        mirrorStartupPrefs(merged);
      }
    } catch { /* IndexedDB unavailable (private mode?) — app still runs with samples */ }
  }, []);

  useEffect(() => {
    void refreshLibrary();
    const on = () => setNavigatorOnline(true);
    const off = () => setNavigatorOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refreshLibrary]);

  const datasets = useMemo(() => mergeDatasets(sessionDatasets, downloaded), [sessionDatasets, downloaded]);
  const downloadedIds = useMemo(() => new Set(downloaded.map((d) => d.id)), [downloaded]);
  const currentDataset = datasets.find((d) => d.id === currentDatasetId) ?? datasets[0];
  const usingCached = !navigatorOnline && downloadedIds.has(currentDataset?.id ?? '');
  const connection: ConnectionState = navigatorOnline ? 'online' : usingCached ? 'cached' : 'offline';

  const [mapping, setMappingState] = useState<MappingConfig>({
    profileId: 'musical', speed: 4, masterVolume: 0.7, muted: false, spatialPan: true,
    instrument: DEFAULT_INSTRUMENT_ID,
    instrumentProfileId: DEFAULT_PROFILE_ID,
    useInstrumentVoice: true,
  });

  useEffect(() => {
    setMappingState((m) => ({ ...m, profileId: settings.profileId, speed: settings.speed, masterVolume: settings.volume }));
  }, [settings.profileId, settings.speed, settings.volume]);
  useEffect(() => {
    document.documentElement.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  }, [settings.highContrast, settings.reduceMotion, settings.textScale]);
  // Keep the synchronous settings mirror in step with whatever the app last applied.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateSettings = useCallback((p: Partial<AppSettings>) => {
    const previous = settingsRef.current;
    const next = { ...previous, ...p };
    settingsRef.current = next;
    setSettings(next);
    mirrorStartupPrefs(next);
    if (p.introFrequency) markIntroFrequencyChosen();
    // Turning the intro back on means "I want to see it": let it play again.
    if (p.introEnabled === true && !previous.introEnabled) resetIntroSeen();
    void db.setKv('settings', next).catch(() => undefined);
  }, []);

  const updateMapping = useCallback((p: Partial<MappingConfig>) => {
    setMappingState((m) => ({ ...m, ...p }));
  }, []);

  const setAvatarProfile = useCallback((o: AvatarOptions) => {
    setAvatarState(o);
    saveAvatar(o);
  }, []);

  /** Simulated chunked download with progress + cancellation (works offline for bundled samples). */
  const saveDataset = useCallback(async (d: DatasetMeta) => {
    cancelFlags.current[d.id] = false;
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      if (cancelFlags.current[d.id]) {
        setDownloading((prev) => { const n = { ...prev }; delete n[d.id]; return n; });
        throw new Error('Download cancelled.');
      }
      await new Promise((r) => setTimeout(r, 60));
      setDownloading((prev) => ({ ...prev, [d.id]: i / steps }));
    }
    const stored: DatasetMeta = {
      ...d,
      provenance: d.provenance === 'nasa-live' ? 'nasa-cached' : d.provenance,
    };
    await db.putDataset(stored);
    setDownloading((prev) => { const n = { ...prev }; delete n[d.id]; return n; });
    await refreshLibrary();
  }, [refreshLibrary]);

  const removeDataset = useCallback(async (id: string) => {
    if (SAMPLE_DATASETS.some((d) => d.id === id)) throw new Error('Bundled demos cannot be deleted — they ship with the app.');
    await db.deleteDataset(id);
    await refreshLibrary();
  }, [refreshLibrary]);

  const cancelDownload = useCallback((id: string) => { cancelFlags.current[id] = true; }, []);

  const saveExperience = useCallback(async (name: string) => {
    const now = new Date().toISOString();
    const exp: Experience = {
      id: `exp-${Date.now()}`, name: name.trim() || `Experience ${experiences.length + 1}`,
      datasetId: currentDatasetId, mapping: { ...mapping },
      timeRange: null, createdAt: now, lastPlayedAt: now,
    };
    await db.putExperience(exp);
    await refreshLibrary();
  }, [currentDatasetId, mapping, experiences.length, refreshLibrary]);

  const addSessionDataset = useCallback((d: DatasetMeta) => {
    setSessionDatasets((prev) => {
      const rest = prev.filter((x) => x.id !== d.id);
      return [...rest, d];
    });
  }, []);

  const value: AppState = {
    tab, setTab, simTarget, requestSim, clearSimTarget, settings, updateSettings,
    avatar, setAvatarProfile, profileOpen, setProfileOpen, connection, usingCached,
    datasets, downloadedIds, downloading, recent: experiences.slice(0, 5), experiences,
    currentDatasetId, currentDataset, selectDataset: setCurrentDatasetId,
    mapping, updateMapping, saveDataset, removeDataset, cancelDownload,
    saveExperience, refreshLibrary, storage,
  };
  // expose session adder for Online panel
  (value as unknown as Record<string, unknown>).addSessionDataset = addSessionDataset;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState & { addSessionDataset: (d: DatasetMeta) => void } {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx as AppState & { addSessionDataset: (d: DatasetMeta) => void };
}