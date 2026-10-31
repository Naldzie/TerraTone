import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** In-scene settings drawer: a scrollable panel docked over the 3D viewport. */
export function SimSettingsOverlay({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="simsettings" role="dialog" aria-modal="true" aria-label="Simulation settings">
      <div className="simsettings-head">
        <b><Icon name="settings" /> Simulation settings</b>
        <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close settings" autoFocus><Icon name="x" /> Close</button>
      </div>
      <div className="simsettings-body">{children}</div>
    </div>
  );
}
