import type { Provenance } from '../types';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export function Logo() {
  return (
    <span className="brand" aria-label="TerraTone home">
      <img src="/icons/logo.png" alt="" aria-hidden="true" />
      <span>TerraTone<small>HEAR THE PULSE OF OUR PLANET</small></span>
    </span>
  );
}

const LABELS: Record<Provenance, { icon: IconName; text: string }> = {
  'nasa-live': { icon: 'broadcast', text: 'Live NASA data' },
  'nasa-cached': { icon: 'cloud', text: 'Cached NASA data' },
  sample: { icon: 'database', text: 'Demo data' },
};

export function ProvTag({ p }: { p: Provenance }) {
  const label = LABELS[p];
  if (!label) return null;
  return <span className="tag" data-p={p}><Icon name={label.icon} /> {label.text}</span>;
}
