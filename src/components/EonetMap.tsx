import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../lib/leafletIcon';
import { eventPoint } from '../lib/eonet';
import type { EonetEvent } from '../lib/eonet';

/**
 * Live events map (Leaflet + OpenStreetMap tiles). Tiles need a connection;
 * the panel hides the map offline and keeps the list from cache instead.
 */
export function EonetMap({ events, onSelect }: {
  events: EonetEvent[];
  onSelect: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const map = L.map(el, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© OpenStreetMap contributors · Events: NASA EONET',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    for (const ev of events) {
      const p = eventPoint(ev);
      if (!p) continue;
      const cat = ev.categories[0]?.title ?? 'Event';
      L.marker([p.lat, p.lon], { title: ev.title })
        .bindPopup(`<b>${escapeHtml(ev.title)}</b><br/>${escapeHtml(cat)}`)
        .on('click', () => selectRef.current(ev.id))
        .addTo(layer);
    }
    return () => {
      map.removeLayer(layer);
    };
  }, [events]);

  return (
    <div
      ref={divRef}
      className="eonetmap"
      role="application"
      aria-label="World map of live NASA-tracked natural events. Markers mirror the event list below."
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
