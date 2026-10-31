import { describe, expect, it } from 'vitest';
import {
  categoryToSim, eventLatestDate, eventPoint, feedCategories, filterEvents, geometryPoint,
} from '../lib/eonet';
import type { EonetEvent } from '../lib/eonet';
import { parseApod } from '../lib/apod';

const ev = (id: string, cats: string[], geoms: EonetEvent['geometry']): EonetEvent => ({
  id, title: id, description: null, link: 'https://eonet.gsfc.nasa.gov/', closed: null,
  categories: cats.map((c) => ({ id: c, title: c })),
  sources: [],
  geometry: geoms,
});

describe('EONET geometry helpers', () => {
  it('reads points and polygon rings', () => {
    expect(geometryPoint({ date: '', type: 'Point', coordinates: [-120.5, 35.2] }))
      .toEqual({ lon: -120.5, lat: 35.2 });
    expect(geometryPoint({ date: '', type: 'Polygon', coordinates: [[[-10, 5], [-9, 6]]] }))
      .toEqual({ lon: -10, lat: 5 });
    expect(geometryPoint({ date: '', type: 'Point', coordinates: ['x', null] })).toBeNull();
  });
  it('prefers the latest geometry with coordinates', () => {
    const e = ev('a', ['wildfires'], [
      { date: '2026-01-01', type: 'Point', coordinates: [0, 0] },
      { date: '2026-02-01', type: 'Point', coordinates: [10, 20] },
    ]);
    expect(eventPoint(e)).toEqual({ lon: 10, lat: 20 });
    expect(eventLatestDate(e)).toBe('2026-02-01');
  });
  it('returns null when nothing is locatable', () => {
    expect(eventPoint(ev('b', ['floods'], []))).toBeNull();
    expect(eventLatestDate(ev('b', ['floods'], []))).toBe('');
  });
});

describe('EONET category mapping + filtering', () => {
  it('maps event types onto matching simulators', () => {
    expect(categoryToSim('wildfires')).toBe('wildfire');
    expect(categoryToSim('volcanoes')).toBe('volcano');
    expect(categoryToSim('severeStorms')).toBe('hurricane');
    expect(categoryToSim('earthquakes')).toBe('earthquake');
    expect(categoryToSim('floods')).toBeNull();
    expect(categoryToSim('landslides')).toBeNull();
    expect(categoryToSim('drought')).toBeNull();
    expect(categoryToSim('snow')).toBeNull();
  });
  it('filters and lists categories', () => {
    const list = [
      ev('1', ['wildfires'], []),
      ev('2', ['volcanoes'], []),
      ev('3', ['wildfires', 'severeStorms'], []),
    ];
    expect(filterEvents(list, 'all')).toHaveLength(3);
    expect(filterEvents(list, 'wildfires')).toHaveLength(2);
    expect(filterEvents(list, 'volcanoes')).toHaveLength(1);
    expect(feedCategories(list)).toEqual([
      { id: 'wildfires', title: 'wildfires' },
      { id: 'volcanoes', title: 'volcanoes' },
      { id: 'severeStorms', title: 'severeStorms' },
    ]);
  });
});

describe('APOD parsing', () => {
  it('normalizes image entries', () => {
    const a = parseApod({ date: '2026-01-01', title: 'T', explanation: 'E', url: 'https://x/y.jpg', media_type: 'image' });
    expect(a.media_type).toBe('image');
    expect(a.copyright).toBeUndefined();
  });
  it('flags videos and rejects garbage', () => {
    expect(parseApod({ date: 'd', title: 't', url: 'u', media_type: 'video' }).media_type).toBe('video');
    expect(() => parseApod({})).toThrow(/unexpected/);
    expect(() => parseApod(null)).toThrow(/unexpected/);
  });
});
