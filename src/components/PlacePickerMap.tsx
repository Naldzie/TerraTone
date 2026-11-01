/* Interactive place picker (Leaflet + OpenStreetMap): the user chooses the
 * point by clicking the map instead of typing latitude and longitude.
 * Tiles need a connection — offline the grid stays blank but the picker, the
 * marker and the Place select keep working. */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampLat = (n: number) => round2(Math.max(-90, Math.min(90, n)));
const wrapLon = (n: number) => round2((((n + 180) % 360) + 360) % 360 - 180);

interface PlacePickerProps {
  lat: number;
  lon: number;
  onPick: (lat: number, lon: number) => void;
}

export function PlacePickerMap({ lat, lon, onPick }: PlacePickerProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let map: L.Map;
    try {
      map = L.map(el, {
        center: [lat, lon],
        zoom: 3,
        scrollWheelZoom: false,
        worldCopyJump: true,
      });
    } catch {
      return; // no layout yet (jsdom) — the Place select keeps working as the fallback
    }
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => pickRef.current(clampLat(e.latlng.lat), wrapLon(e.latlng.lng)));

    const marker = L.marker([lat, lon], { draggable: true, title: 'Chosen point — drag to move it' }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      pickRef.current(clampLat(p.lat), wrapLon(p.lng));
    });

    mapRef.current = map;
    markerRef.current = marker;
    // The drawer/card may finish laying out after mount, so re-measure shortly after.
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount-only: later coordinate changes move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in step with the Place select, "My location", or a preset city.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const target = L.latLng(lat, lon);
    const current = marker.getLatLng();
    if (Math.abs(current.lat - target.lat) < 1e-6 && Math.abs(current.lng - target.lng) < 1e-6) return;
    marker.setLatLng(target);
    map.panTo(target, { animate: true });
  }, [lat, lon]);

  return (
    <div className="placepicker">
      <div
        ref={divRef}
        className="placepicker__map"
        data-testid="placepicker"
        role="application"
        aria-label="World map for choosing a place. Click to drop the reading point, drag the pin to move it, or use + and − to zoom. The Place menu above does the same without a pointer."
      />
      <p className="placepicker__hint">
        Tap the map or drag the pin to pick a place.
      </p>
    </div>
  );
}
