import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SIM_ART_IDS, SimArt } from '../components/SimArt';
import { DataArt, dataHue, sparkGeometry } from '../components/DataArt';
import { SAMPLE_DATASETS } from '../data/samples';

describe('sim illustrations', () => {
  it('renders an accessible, non-empty svg for every sim', () => {
    for (const id of SIM_ART_IDS) {
      const { container, unmount } = render(<SimArt id={id} className="simart" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-label')!.length).toBeGreaterThan(20);
      // Every scene must actually draw something.
      expect(container.querySelectorAll('rect, path, circle, ellipse, line').length).toBeGreaterThan(5);
      unmount();
    }
  });
  it('covers all nine hazards plus the tornado', () => {
    expect(SIM_ART_IDS).toHaveLength(10);
    expect(new Set(SIM_ART_IDS).size).toBe(10);
  });
});

describe('dataset data art', () => {
  it('renders an accessible sparkline thumbnail for every bundled demo', () => {
    for (const d of SAMPLE_DATASETS) {
      const { container, unmount } = render(<DataArt dataset={d} className="dataart" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-label')).toContain(d.title);
      expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // area + line
      expect(container.querySelector('text')!.textContent).toContain('DEMO');
      unmount();
    }
  });
  it('derives a deterministic hue per category', () => {
    expect(dataHue('Oceans and coasts')).toBe(dataHue('Oceans and coasts'));
    expect(dataHue('Storms')).toBeGreaterThanOrEqual(0);
    expect(dataHue('Storms')).toBeLessThan(360);
    const cats = new Set(SAMPLE_DATASETS.map((d) => d.category));
    const hues = new Set([...cats].map((c) => dataHue(c)));
    expect(hues.size).toBeGreaterThanOrEqual(Math.min(cats.size, 8));
  });
  it('keeps drawing across missing values (gap months)', () => {
    const withNulls = SAMPLE_DATASETS.find((d) => d.id === 'sample-sea-level')!;
    expect(withNulls.points.some((p) => p.value === null)).toBe(true);
    const geo = sparkGeometry(withNulls.points);
    expect(geo.line).toContain('M');
    expect(geo.n).toBeGreaterThan(100);
  });
  it('bundles at least sixteen distinct demo datasets, all labeled as samples', () => {
    expect(SAMPLE_DATASETS.length).toBeGreaterThanOrEqual(16);
    const ids = SAMPLE_DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of SAMPLE_DATASETS) {
      expect(d.provenance).toBe('sample');
      expect(d.points.length).toBeGreaterThan(10);
      expect(d.mappingNote.length).toBeGreaterThan(30);
      const lo = Math.min(...d.points.map((p) => p.value ?? Infinity));
      const hi = Math.max(...d.points.map((p) => p.value ?? -Infinity));
      expect(d.range[0]).toBeLessThanOrEqual(lo);
      expect(d.range[1]).toBeGreaterThanOrEqual(hi);
    }
  });
});
