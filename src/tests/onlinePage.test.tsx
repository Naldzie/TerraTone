import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Online } from '../pages/Online';
import { POWER_LIVE_VARS, fetchPowerNow } from '../lib/nasa';
import { useApp } from '../store/AppContext';
import type { DatasetMeta } from '../types';

vi.mock('../lib/nasa', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/nasa')>();
  return { ...mod, fetchPowerNow: vi.fn() };
});
vi.mock('../components/EonetPanel', () => ({ EonetPanel: () => <div data-testid="eonet" /> }));
vi.mock('../components/EpicPanel', () => ({ EpicPanel: () => <div data-testid="epic" /> }));
vi.mock('../components/ApodPanel', () => ({ ApodPanel: () => <div data-testid="apod" /> }));
// The Leaflet map is swapped for a button that behaves like a click on Tokyo.
vi.mock('../components/PlacePickerMap', () => ({
  PlacePickerMap: ({ onPick }: { lat: number; lon: number; onPick: (la: number, lo: number) => void }) => (
    <button type="button" data-testid="placepicker" onClick={() => onPick(35.68, 139.69)}>
      pick Tokyo on the map
    </button>
  ),
}));
vi.mock('../components/Player', () => ({ Player: () => <div data-testid="player" /> }));
vi.mock('../components/InstrumentProfilePanel', () => ({ InstrumentProfilePanel: () => <div data-testid="profile" /> }));
vi.mock('../components/AiExplain', () => ({ AiExplain: () => <div data-testid="ai" /> }));

vi.mock('../store/AppContext', () => {
  const state = {
    connection: 'online' as 'online' | 'offline' | 'cached',
    requestSim: vi.fn(),
    datasets: [] as DatasetMeta[],
    currentDataset: undefined as DatasetMeta | undefined,
    mapping: {
      profileId: 'musical',
      speed: 4,
      masterVolume: 0.7,
      muted: false,
      spatialPan: true,
      instrument: 'piano',
      instrumentProfileId: 'grand-piano',
      useInstrumentVoice: true,
    },
    updateMapping: vi.fn(),
    addSessionDataset: vi.fn((d: DatasetMeta) => { state.datasets = [d]; }),
    selectDataset: vi.fn((id: string) => {
      state.currentDataset = state.datasets.find((x) => x.id === id);
    }),
  };
  return { useApp: () => state };
});

/** Mutable view of the mocked app state (the factory owns the real object). */
const app = useApp() as unknown as {
  connection: 'online' | 'offline' | 'cached';
  datasets: DatasetMeta[];
  currentDataset: DatasetMeta | undefined;
  addSessionDataset: (d: DatasetMeta) => void;
  selectDataset: (id: string) => void;
};

const liveDs: DatasetMeta = {
  id: 'nasa-power-now-T2M-hourly-37.77--122.42',
  title: 'Air temperature (2 m) — last 24 hours (37.77°, -122.42°)',
  category: 'Weather and precipitation',
  description: 'Hourly air temperature (2 m) from NASA POWER.',
  units: '°C',
  range: [10, 26],
  provenance: 'nasa-live',
  sourceName: 'NASA POWER',
  sourceUrl: 'https://power.larc.nasa.gov/',
  coverage: 'Point 37.77°, -122.42°; 2026-10-26 12:00 → 2026-10-26 13:00',
  resolution: 'Hourly analysis',
  license: 'U.S. public domain',
  updatedAt: '2026-10-28T03:00',
  points: [
    { t: '2026-10-26 12:00', value: 15.2 },
    { t: '2026-10-26 13:00', value: 18.4 },
  ],
  mappingNote: 'Temperature over time → pitch.',
};

const fetchMock = vi.mocked(fetchPowerNow);

beforeEach(() => {
  app.connection = 'online';
  app.datasets = [];
  app.currentDataset = undefined;
  vi.clearAllMocks();
});

afterEach(cleanup);
afterEach(() => { vi.useRealTimers(); });

describe('Live tab — NASA POWER latest-conditions console', () => {
  it('renders the live console controls and the feed panels', () => {
    render(<Online />);
    expect(screen.getByRole('heading', { name: /hear the latest conditions/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Place')).toBeInTheDocument();
    expect(screen.getByTestId('placepicker')).toBeInTheDocument();
    expect(screen.getByTestId('picked-point')).toHaveTextContent('San Francisco, USA');
    expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Longitude')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Variable')).toBeInTheDocument();
    expect(screen.getByLabelText('Window')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fetch latest data/i })).toBeInTheDocument();
    // Natural events moved to their own Events tab.
    expect(screen.queryByTestId('eonet')).not.toBeInTheDocument();
    expect(screen.getByTestId('epic')).toBeInTheDocument();
    expect(screen.getByTestId('apod')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  });

  it('fetches the default place, then shows stats and the Listen experience', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);

    fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(37.77, -122.42, { key: 'T2M', series: 'hourly', window: 24 });
    expect(app.addSessionDataset).toHaveBeenCalledWith(liveDs);
    expect(app.selectDataset).toHaveBeenCalledWith(liveDs.id);

    expect(screen.getByText('Newest frame')).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label).closest('.stat')!;
    expect(stat('Newest frame')).toHaveTextContent('2026-10-26 13:00');
    expect(stat('Latest value')).toHaveTextContent('18.4 °C');
    expect(stat('Range low')).toHaveTextContent('15.2 °C');
    expect(stat('Range high')).toHaveTextContent('18.4 °C');
    expect(stat('Frames')).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: /latest published values/i })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /live console/i })).toBeInTheDocument();
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.getByTestId('profile')).toBeInTheDocument();
  });

  it('moves the reading point when a city preset is chosen', () => {
    render(<Online />);
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: '2' } }); // London
    expect(screen.getByTestId('picked-point')).toHaveTextContent('London, UK');
  });

  it('takes the point from the map instead of typed coordinates', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);
    fireEvent.click(screen.getByRole('button', { name: /pick tokyo on the map/i }));
    expect(screen.getByTestId('picked-point')).toHaveTextContent('35.68°, 139.69°');
    fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      35.68,
      139.69,
      { key: 'T2M', series: 'hourly', window: 24 },
    ));
  });

  it('forces precipitation onto the daily window', () => {
    render(<Online />);
    fireEvent.change(screen.getByLabelText('Variable'), { target: { value: 'PRECTOTCORR' } });
    const win = screen.getByLabelText('Window') as HTMLSelectElement;
    expect(win.value).toBe('2'); // first daily option
    expect(win.options[0].disabled).toBe(true);
  });

  it('disables fetching and warns when offline', () => {
    app.connection = 'offline';
    render(<Online />);
    expect(screen.getByRole('button', { name: /fetch latest data/i })).toBeDisabled();
    expect(screen.getByText(/live nasa power fetches need a connection/i)).toBeInTheDocument();
  });

  it('surfaces fetch failures as an alert without the live console', async () => {
    fetchMock.mockRejectedValue(new Error('NASA POWER has no usable recent data for these coordinates yet.'));
    render(<Online />);
    fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no usable recent data/i));
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  });
});

describe('Live tab — right-now readout', () => {
  it('prompts before any fetch, then shows the newest value, trend and freshness', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);
    expect(screen.getByText(/nothing loaded yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('now-value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));
    await waitFor(() => expect(screen.getByTestId('now-value')).toBeInTheDocument());

    expect(screen.getByTestId('now-value')).toHaveTextContent('18.4°C');
    expect(screen.getByText(/▲ \+3\.2 °C vs previous hour \(was 15\.2\)/)).toBeInTheDocument();
    expect(screen.getByText(/as of 2026-10-26 13:00/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /keep it live/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh now/i })).toBeEnabled();
    expect(screen.getByRole('group', { name: /one-tap live readings/i })).toBeInTheDocument();
    expect(screen.queryByText(/nothing loaded yet/i)).not.toBeInTheDocument();
  });

  it('one-tap readings fetch the matching variable and window', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);
    fireEvent.click(screen.getByRole('button', { name: /rain · daily/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(37.77, -122.42, { key: 'PRECTOTCORR', series: 'daily', window: 14 });
    expect((screen.getByLabelText('Variable') as HTMLSelectElement).value).toBe('PRECTOTCORR');
    expect((screen.getByLabelText('Window') as HTMLSelectElement).value).toBe('2');
  });

  it('reads every POWER variable for the point and drops one into Listen', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);

    fireEvent.click(screen.getByRole('button', { name: /read everything live/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(POWER_LIVE_VARS.length));

    expect(fetchMock).toHaveBeenCalledWith(37.77, -122.42, { key: 'T2M', series: 'hourly', window: 24 });
    expect(fetchMock).toHaveBeenCalledWith(37.77, -122.42, { key: 'PRECTOTCORR', series: 'daily', window: 14 });
    expect(fetchMock).toHaveBeenCalledWith(37.77, -122.42, { key: 'PS', series: 'hourly', window: 24 });

    expect(screen.getByRole('group', { name: /live readings for this location/i })).toBeInTheDocument();
    expect(screen.getByTestId('snap-T2M')).toHaveTextContent('18.4°C');
    expect(screen.getByTestId('snap-WS2M')).toHaveTextContent('18.4m/s');

    fireEvent.click(screen.getByRole('button', { name: /hear humidity in the listen console/i }));
    expect(app.addSessionDataset).toHaveBeenCalledWith(liveDs);
    expect(app.selectDataset).toHaveBeenCalledWith(liveDs.id);
    expect((screen.getByLabelText('Variable') as HTMLSelectElement).value).toBe('RH2M');
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('re-reads the point every 60 s once "Keep it live" is switched on', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: /keep it live/i }));
    expect(screen.getByRole('checkbox', { name: /keep it live/i })).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1); // enabling on its own never spams NASA

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('disables the snapshot and the keep-live switch when offline', async () => {
    fetchMock.mockResolvedValue(liveDs);
    render(<Online />);
    fireEvent.click(screen.getByRole('button', { name: /fetch latest data/i }));
    await waitFor(() => expect(screen.getByTestId('now-value')).toBeInTheDocument());

    app.connection = 'offline';
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: '1' } }); // any state change re-renders

    expect(screen.getByRole('button', { name: /read everything live/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /keep it live/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /refresh now/i })).toBeDisabled();
  });
});
