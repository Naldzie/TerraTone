import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '../store/AppContext';
import {
  ACCENTS, AVATAR_PRESETS, BOOTS, DEFAULT_AVATAR, HAIR_COLORS, MATCH, SKINS, SUITS, VISOR_TINTS,
  AvatarAnimator, buildAvatarMesh, disposeAvatarBody, randomAvatarOptions,
} from '../sim/avatar';
import type {
  AvatarOptions, BackWear, BodyType, BuildType, EarWear, FaceStyle, HairStyle, Headgear,
  NeckWear, Swatch, VisorStyle,
} from '../sim/avatar';
import type { TabId } from '../store/AppContext';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const BODY_LABELS: Record<BodyType, string> = { girl: 'Girl', boy: 'Boy' };
const HEADGEAR_LABELS: Record<Headgear, string> = {
  helmet: 'Helmet', cap: 'Cap', beanie: 'Beanie', bucket: 'Bucket hat',
  crown: 'Crown', headband: 'Headband', tophat: 'Top hat', antennae: 'Antennae', none: 'Bare',
};
const FACE_LABELS: Record<FaceStyle, string> = {
  friendly: 'Friendly', brave: 'Brave', shades: 'Shades', goggles: 'Goggles', spectacles: 'Spectacles',
};
const HAIR_LABELS: Record<HairStyle, string> = {
  buzz: 'Buzz', mohawk: 'Mohawk', bob: 'Bob', ponytail: 'Ponytail',
  long: 'Long', buns: 'Space buns', braids: 'Braids',
};
const NECK_LABELS: Record<NeckWear, string> = {
  none: 'None', scarf: 'Scarf', bandana: 'Bandana', bowtie: 'Bow tie', medal: 'Medal',
};
const BACK_LABELS: Record<BackWear, string> = {
  pack: 'Backpack', cape: 'Cape', wings: 'Wings', jetpack: 'Jetpack', none: 'None',
};
const EAR_LABELS: Record<EarWear, string> = { none: 'None', headphones: 'Headphones' };

/** Spinning 3D preview of the current explorer look. Disposes cleanly. */
export function AvatarPreview({ opts }: { opts: AvatarOptions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const bodyRef = useRef<THREE.Group | null>(null);
  const animRef = useRef<AvatarAnimator | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Devices (and jsdom) without WebGL fall back to the styled canvas behind it.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x223344, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(3, 6, 4);
    scene.add(dir);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    cam.position.set(0, 3.1, 10.5);
    cam.lookAt(0, 2.9, 0);
    const t0 = performance.now();
    let last = t0;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const b = bodyRef.current;
      if (b) {
        // Turntable spin + the same breathing idle the explorer uses in-world.
        b.rotation.y += 0.012;
        animRef.current?.update({ dt, t: (now - t0) / 1000, speed: 0, lookYaw: 0 });
      }
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      if (bodyRef.current) disposeAvatarBody(bodyRef.current);
      bodyRef.current = null;
      sceneRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (bodyRef.current) {
      disposeAvatarBody(bodyRef.current);
      scene.remove(bodyRef.current);
    }
    const b = buildAvatarMesh(opts);
    bodyRef.current = b.body;
    animRef.current = new AvatarAnimator(b);
    scene.add(b.body);
  }, [opts]);

  return <canvas ref={canvasRef} className="avatarPreview" role="img" aria-label="Spinning 3D preview of your explorer" />;
}

const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`;

/** Preset color chips + a free color picker; optionally a "Match" chip (value MATCH). */
function Swatches({ label, colors, value, onPick, disabled, matchLabel, fallback }: {
  label: string; colors: Swatch[]; value: number; onPick: (v: number) => void; disabled?: boolean;
  /** Show a chip that sets MATCH (follow the suit / automatic). */
  matchLabel?: string;
  /** Color the picker starts from while the value is MATCH. */
  fallback?: number;
}) {
  const custom = value !== MATCH && !colors.some((c) => c.value === value);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" role="group" aria-label={label}>
        {matchLabel && (
          <button className="btn sm" aria-pressed={value === MATCH} disabled={disabled} onClick={() => onPick(MATCH)}>
            {matchLabel}
          </button>
        )}
        {colors.map((c) => (
          <button
            key={c.value}
            className="swatch"
            style={{ background: `#${c.value.toString(16).padStart(6, '0')}` }}
            aria-pressed={value === c.value}
            aria-label={`${c.name}${value === c.value ? ' (selected)' : ''}`}
            title={c.name}
            disabled={disabled}
            onClick={() => onPick(c.value)}
          />
        ))}
        <label className="swatch swatch--picker" aria-pressed={custom} title="Pick any color"
          style={custom ? { background: hex(value) } : undefined}>
          <input
            type="color"
            aria-label={`${label}: pick any color`}
            disabled={disabled}
            value={hex(value === MATCH ? (fallback ?? 0xffffff) : value)}
            onChange={(e) => onPick(parseInt(e.target.value.slice(1), 16))}
          />
        </label>
      </div>
    </div>
  );
}

function ChoiceRow<T extends string>({ label, options, value, onPick, disabled, icons, labels }: {
  label: string; options: readonly T[]; value: T; onPick: (v: T) => void; disabled?: boolean;
  icons?: Partial<Record<T, IconName>>; labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            className="btn sm"
            aria-pressed={value === o}
            disabled={disabled}
            onClick={() => onPick(o)}
          >{icons?.[o] && <Icon name={icons[o]} />} {labels?.[o] ?? o}</button>
        ))}
      </div>
    </div>
  );
}

interface StudioProps {
  /** Closes the profile menu (navigation from inside it). */
  onClose?: () => void;
}

/** Full character editor: character type, headgear, wardrobe, suits + presets. */
export function AvatarStudio({ onClose }: StudioProps = {}) {
  const { avatar, setAvatarProfile, setTab } = useApp();
  const [draft, setDraft] = useState<AvatarOptions>(avatar);
  const [more, setMore] = useState(false);
  const timer = useRef<number | null>(null);

  // Push edits live into every running simulator (debounced for sliders' sake).
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAvatarProfile(draft), 120);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // If the profile changes elsewhere, resync the draft.
  useEffect(() => { setDraft(avatar); }, [avatar]);

  const set = <K extends keyof AvatarOptions>(k: K, v: AvatarOptions[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const helmetOn = draft.headgear === 'helmet';
  const go = (t: TabId) => { setTab(t); onClose?.(); };

  return (
    <div className="card studiocard">
      <div className="studio">
        <div className="studio__choices">
          <div className="row">
            {AVATAR_PRESETS.map((p) => (
              <button key={p.name} className="btn sm" onClick={() => setDraft({ ...p.opts })}>
                <Icon name={p.icon} /> {p.name}
              </button>
            ))}
          </div>
          <ChoiceRow<BodyType> label="Character" options={['girl', 'boy'] as const} value={draft.body}
            onPick={(v) => set('body', v)} labels={BODY_LABELS} />
          <ChoiceRow<Headgear> label="Headgear" options={['helmet', 'cap', 'beanie', 'bucket', 'crown', 'headband', 'tophat', 'antennae', 'none'] as const}
            value={draft.headgear} onPick={(v) => set('headgear', v)} labels={HEADGEAR_LABELS}
            icons={{ helmet: 'helmet', cap: 'cap', none: 'hair' }} />
          <ChoiceRow<VisorStyle> label="Visor (helmet)" options={['classic', 'wide', 'round'] as const} value={draft.visor}
            onPick={(v) => set('visor', v)} disabled={!helmetOn} />
          <Swatches label="Visor tint (helmet)" colors={VISOR_TINTS} value={draft.visorTint}
            onPick={(v) => set('visorTint', v)} disabled={!helmetOn} />
          <ChoiceRow<FaceStyle> label="Face (cap / bare)" options={['friendly', 'brave', 'shades', 'goggles', 'spectacles'] as const}
            value={draft.face} onPick={(v) => set('face', v)} disabled={helmetOn} labels={FACE_LABELS} />
          <ChoiceRow<HairStyle> label="Hairstyle (cap / bare)" options={['buzz', 'mohawk', 'bob', 'ponytail', 'long', 'buns', 'braids'] as const}
            value={draft.hair} onPick={(v) => set('hair', v)} disabled={helmetOn} labels={HAIR_LABELS} />
          <Swatches label="Hair color" colors={HAIR_COLORS} value={draft.hairColor} onPick={(v) => set('hairColor', v)} disabled={helmetOn} />
          <Swatches label="Skin tone" colors={SKINS} value={draft.skin} onPick={(v) => set('skin', v)} />
          <Swatches label="Suit" colors={SUITS} value={draft.suit} onPick={(v) => set('suit', v)} />
          <Swatches label="Accent" colors={ACCENTS} value={draft.accent} onPick={(v) => set('accent', v)} />
          <Swatches label="Trousers" colors={SUITS} value={draft.pants} onPick={(v) => set('pants', v)}
            matchLabel="Match suit" fallback={draft.suit} />
          <Swatches label="Gloves" colors={ACCENTS} value={draft.gloves} onPick={(v) => set('gloves', v)}
            matchLabel="Auto" fallback={draft.accent} />
          <Swatches label="Boots" colors={BOOTS} value={draft.boots} onPick={(v) => set('boots', v)} />
          <ChoiceRow<BuildType> label="Build" options={['slim', 'standard', 'bulky'] as const} value={draft.build}
            onPick={(v) => set('build', v)} />

          <h4 className="panel-sub"><Icon name="sparkles" /> Wardrobe <small>everything else you can wear</small></h4>
          <ChoiceRow<NeckWear> label="Neck" options={['none', 'scarf', 'bandana', 'bowtie', 'medal'] as const}
            value={draft.neck} onPick={(v) => set('neck', v)} labels={NECK_LABELS} />
          <ChoiceRow<BackWear> label="Back" options={['pack', 'cape', 'wings', 'jetpack', 'none'] as const}
            value={draft.back} onPick={(v) => set('back', v)} labels={BACK_LABELS} />
          <ChoiceRow<EarWear> label="Ears" options={['none', 'headphones'] as const}
            value={draft.ears} onPick={(v) => set('ears', v)} labels={EAR_LABELS} />

          <div className="field">
            <button className="btn sm ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <Icon name="sliders" /> {more ? 'Fewer options' : 'More options'}
            </button>
          </div>
          {more && (
            <div className="morebox">
              <div className="row">
                <button className="btn sm ghost" onClick={() => setDraft((d) => {
                  const r = randomAvatarOptions();
                  return { ...d, headgear: r.headgear, face: r.face, neck: r.neck, back: r.back, ears: r.ears };
                })}><Icon name="dice" /> Shuffle wardrobe</button>
                <button className="btn sm ghost" onClick={() => setDraft((d) => ({ ...d, neck: 'none', back: 'none', ears: 'none' }))}>
                  <Icon name="x" /> Bare wardrobe
                </button>
              </div>
              <div className="row">
                <button className="btn sm ghost" onClick={() => go('settings')}><Icon name="settings" /> Settings</button>
                <button className="btn sm ghost" onClick={() => go('access')}><Icon name="accessibility" /> Access</button>
                <button className="btn sm ghost" onClick={() => go('sims')}><Icon name="gamepad" /> Sims</button>
                <button className="btn sm ghost" onClick={() => go('library')}><Icon name="database" /> Library</button>
              </div>
            </div>
          )}

          <small style={{ color: 'var(--ink-faint)' }}>
            Saved on this device automatically. Bystanders across every simulator get randomized looks from the same system.
          </small>
        </div>

        <aside className="studio__preview" aria-label="Explorer look preview">
          <h3><Icon name="helmet" /> Explorer look <small style={{ color: 'var(--ink-faint)' }}>applies live everywhere</small></h3>
          <AvatarPreview opts={draft} />
          <div className="row studio__quick">
            <button className="btn sm ghost" onClick={() => setDraft(randomAvatarOptions())}><Icon name="dice" /> Surprise me</button>
            <button className="btn sm ghost" onClick={() => setDraft({ ...DEFAULT_AVATAR })}><Icon name="rotate-ccw" /> Default</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
