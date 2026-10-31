import { useEffect } from 'react';
import { AvatarStudio } from './AvatarStudio';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Profile menu: the Explorer look editor (moved out of Settings), the girl /
 * boy character switch, the wardrobe, and a "More" section of shortcuts.
 * Closed when open is false so the 3D preview only ever holds one GL context.
 */
export function ProfileMenu({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="profilemenu" role="dialog" aria-modal="true" aria-label="Profile">
      <div className="profilemenu__head">
        <b><Icon name="helmet" /> Profile</b>
        <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close profile menu" autoFocus>
          <Icon name="x" /> Close
        </button>
      </div>
      <div className="profilemenu__body">
        <AvatarStudio onClose={onClose} />
      </div>
    </div>
  );
}
