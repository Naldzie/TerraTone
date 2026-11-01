/* Leaflet's default marker finds its PNGs by sniffing the CSS path at
 * runtime, which breaks once Vite bundles and hashes the files (the pin
 * shows as a broken image on the deployed site). Import the images so they
 * ship with the build, and point the default icon straight at them.
 * Import this module once before creating any marker. */
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
