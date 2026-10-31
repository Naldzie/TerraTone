/* Shared in-scene chrome for the 3D viewports: keyboard badges, the
 * context prompt ("[E] Board the Spaceship"), and the controls guide. */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Small keyboard badge shown on desktop only (hidden on touch via CSS). */
export function Key({ k }: { k: string }) {
  return <kbd className="key" aria-hidden="true">{k}</kbd>;
}

interface PromptProps {
  riding: boolean;
  vehicle?: { label: string; icon: IconName };
  nearVehicle: boolean;
  npcName: string | null;
  /** Extra vehicles keyed by name (tornado: copter / car). */
  extra?: string | null;
}

/** Game-style context prompt docked above the controls. */
export function SimPrompt({ riding, vehicle, nearVehicle, npcName, extra }: PromptProps) {
  let content: ReactNode = null;
  if (riding && vehicle) {
    content = <><Key k="E" /> Exit {vehicle.label} <span className="simprompt-sep" /> <Key k="Space" /> Rise <span className="simprompt-sep" /> <Key k="Shift" /> Boost</>;
  } else if (nearVehicle && vehicle) {
    content = <><Key k="E" /> Board the {vehicle.label} <Icon name={vehicle.icon} /></>;
  } else if (extra) {
    content = <><Key k="E" /> {extra}</>;
  } else if (npcName) {
    content = <><Key k="T" /> Talk to {npcName} <Icon name="message" /></>;
  }
  if (!content) return null;
  return <div className="simprompt" role="status">{content}</div>;
}

const ROWS: [string[], string][] = [
  [['Mouse'], 'Look around — the cursor hides after Play or a click on the scene; Esc gives it back'],
  [['W', 'A', 'S', 'D'], 'Move (arrow keys work too)'],
  [['Shift'], 'Run / boost (or the Walk ↔ Run button)'],
  [['Space'], 'Jump · in zero-g, thrust upward · aboard, hold to rise'],
  [['E'], 'Board or leave a vehicle'],
  [['T'], 'Talk to a nearby bystander'],
  [['Q'], 'Open / close the simulation settings'],
  [['F'], 'Fullscreen'],
  [['H', '?'], 'Show / hide this guide'],
  [['Esc'], 'Pause'],
];

/** Controls guide overlay (keyboard + mouse + touch). */
export function SimHelp({ vehicle, onClose }: { vehicle?: { label: string; hint?: string }; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="simhelp" role="dialog" aria-modal="true" aria-label="Controls" onClick={onClose}>
      <div className="simhelp-card" onClick={(e) => e.stopPropagation()}>
        <div className="simhelp-head">
          <b><Icon name="gamepad" /> Controls</b>
          <button ref={closeRef} className="btn sm ghost" onClick={onClose} aria-label="Close controls"><Icon name="x" /></button>
        </div>
        <ul className="simhelp-list">
          {ROWS.map(([keys, what]) => (
            <li key={what}>
              <span className="simhelp-keys">{keys.map((k) => <kbd key={k} className="key key--lg">{k}</kbd>)}</span>
              <span>{what}</span>
            </li>
          ))}
        </ul>
        <p className="simhelp-touch"><Icon name="smartphone" /> On touch screens: left joystick to move, drag the scene to look, buttons on the right for everything else.</p>
        {vehicle?.hint && <p className="simhelp-touch"><Icon name="arrow-up" /> {vehicle.hint}</p>}
      </div>
    </div>
  );
}
