/* NASA EPIC (DSCOVR Earth imagery) client — epic.gsfc.nasa.gov, keyless.
 * Docs: https://epic.gsfc.nasa.gov/about/api — public domain imagery, no API key.
 * The old api.nasa.gov/EPIC paths were retired (they302 to a dead route), which
 * is why the panel used to report "NASA EPIC responded 404".
 * DEMO_KEY is kept here because APOD (api.nasa.gov) still needs a key.
 */

export interface EpicImage {
  identifier: string;
  caption: string;
  image: string;
  date: string;
  centroid_coordinates: { lat: number; lon: number };
}

export const DEMO_KEY = 'DEMO_KEY';

const EPIC_BASE = 'https://epic.gsfc.nasa.gov';

/** Build the direct PNG URL for an EPIC natural-color frame (no key needed). Pure (tested). */
export function epicPngUrl(img: Pick<EpicImage, 'image' | 'date'>): string {
  // Take Y/M/D straight from the stamp — no timezone-shifting Date parsing.
  const [y, m, d] = img.date.slice(0, 10).split('-');
  return `${EPIC_BASE}/archive/natural/${y}/${m}/${d}/png/${img.image}.png`;
}

/** Latest natural-color Earth frames, newest first. Throws human-readable errors. */
export async function fetchEpicNatural(count = 3): Promise<{ images: EpicImage[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${EPIC_BASE}/api/natural`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('NASA rate limit reached for EPIC. Wait a moment and retry.');
    }
    if (!res.ok) throw new Error(`NASA EPIC responded ${res.status}. Try again in a few minutes.`);
    const list = (await res.json()) as EpicImage[];
    if (!Array.isArray(list) || list.length === 0) throw new Error('NASA EPIC returned no images right now. Try again later.');
    const sorted = [...list].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    return { images: sorted.slice(0, Math.max(1, Math.min(6, count))) };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('EPIC request timed out. Check your connection and retry.');
    throw e instanceof Error ? e : new Error('EPIC request failed.');
  } finally {
    clearTimeout(t);
  }
}
