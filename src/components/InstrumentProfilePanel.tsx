import { useEffect, useRef, type CSSProperties } from 'react';
import { instrumentEngine } from '../audio/instrumentEngine';
import { effectTags, getInstrument, getProfile, INSTRUMENTS, type InstrumentId } from '../audio/instrumentProfiles';
import { useApp } from '../store/AppContext';
import { Icon } from './Icon';

/**
 * Sound Profile controls (Listen tab): pick one of eight instruments, then one
 * of its five synthesized profiles. The card only configures the voice and
 * shows transport state — playback itself lives in the player below (single set
 * of Play/Pause/Stop buttons, with Repeat and Forwards/Backwards toggles), so
 * nothing here duplicates those controls.
 *
 * `playing` mirrors the player's transport into the badge; `embedded` renders
 * the controls inside the "Dataset sound profile" card instead of their own
 * card (borderless, no duplicate eyebrow).
 */
export function InstrumentProfilePanel({
  embedded = false,
  playing = false,
}: {
  embedded?: boolean;
  playing?: boolean;
}) {
  const { mapping, updateMapping } = useApp();
  const instrument = getInstrument(mapping.instrument);
  const profile = getProfile(instrument, mapping.instrumentProfileId);
  const lastProfile = useRef<Record<string, string>>({});

  // The engine follows the mapping (the player does the same — both are no-ops
  // when nothing changed, so the first effect to run wins).
  useEffect(() => {
    instrumentEngine.setProfile(mapping.instrument, mapping.instrumentProfileId);
    instrumentEngine.setVolume(mapping.masterVolume);
    instrumentEngine.setMuted(mapping.muted);
  }, [mapping.instrument, mapping.instrumentProfileId, mapping.masterVolume, mapping.muted]);

  useEffect(() => () => { instrumentEngine.stopAll(); }, []);

  const chooseInstrument = (id: InstrumentId) => {
    if (id === instrument.id) return;
    lastProfile.current[instrument.id] = profile.id;
    const next = getInstrument(id);
    const remembered = lastProfile.current[id];
    const profileId = next.profiles.some((p) => p.id === remembered) ? remembered! : next.profiles[0].id;
    updateMapping({ instrument: id, instrumentProfileId: profileId });
  };

  const chooseProfile = (profileId: string) => {
    if (profileId === profile.id) return;
    lastProfile.current[instrument.id] = profileId;
    updateMapping({ instrumentProfileId: profileId });
  };

  const tags = effectTags(profile.spec);
  const badgeState = playing ? 'playing' : 'idle';
  const badgeLabel = badgeState === 'playing' ? 'Playing dataset' : 'Idle';

  return (
    <section
      className={embedded ? 'sound-profile sound-profile--embedded' : 'sound-profile'}
      style={{ '--accent': instrument.accent } as CSSProperties}
      aria-label="Instrument sound profiles"
    >
      <div className="sound-profile__head">
        <div>
          {!embedded && (
            <span className="sound-profile__eyebrow"><Icon name="music" /> Sound profile</span>
          )}
          <h2>{instrument.name} voice</h2>
          <p>{instrument.description}</p>
        </div>
        <div className="sound-profile__badge" data-state={badgeState} role="status">
          <span className="dot" aria-hidden="true" />
          {badgeLabel}
        </div>
      </div>

      <div className="sound-profile__now">
        <span className="sound-profile__now-label">Selected</span>
        <strong>{profile.name}</strong>
        <span>on {instrument.name}</span>
        {mapping.useInstrumentVoice && (
          <span className="sound-profile__routed"><Icon name="check" /> Player routed</span>
        )}
      </div>

      <fieldset className="instrument-fieldset">
        <legend>Instrument</legend>
        <div className="instrument-chips" role="group" aria-label="Choose an instrument">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst.id}
              type="button"
              className="instrument-chip"
              aria-pressed={inst.id === instrument.id}
              onClick={() => chooseInstrument(inst.id)}
            >
              <span className="instrument-chip__dot" style={{ background: inst.accent, color: inst.accent }} aria-hidden="true" />
              {inst.name}
            </button>
          ))}
        </div>
        <p className="sound-profile__instrument-blurb">
          <b>{instrument.tagline}.</b> Five profiles, synthesized live in your browser — no samples, works offline.
        </p>
      </fieldset>

      <div className="sound-profile-grid" role="radiogroup" aria-label={`Sound profiles for ${instrument.name}`}>
        {instrument.profiles.map((p) => {
          const selected = p.id === profile.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className="sound-profile-card"
              onClick={() => chooseProfile(p.id)}
            >
              <span className="sound-profile-card__head">
                {p.name}
                {selected && <Icon name="check" />}
              </span>
              <span className="sound-profile-card__desc">{p.description}</span>
              <span className="sound-profile-tags">
                {effectTags(p.spec).map((tag) => (
                  <span key={tag} className="sound-profile-tag">{tag}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sound-profile__settings">
        <div className="sound-profile__volume field">
          <label htmlFor="profile-volume">Profile volume {mapping.muted ? '(muted)' : ''}</label>
          <input
            id="profile-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={mapping.masterVolume}
            onChange={(e) => updateMapping({ masterVolume: Number(e.target.value) })}
          />
        </div>
        <label className="sound-profile-route">
          <input
            type="checkbox"
            checked={mapping.useInstrumentVoice}
            onChange={(e) => updateMapping({ useInstrumentVoice: e.target.checked })}
          />
          <span>
            <b>Route the player through this instrument</b>
            <small>Every dataset frame is voiced with this profile — pick Piano, press Play, and the data sounds like the piano. Off falls back to the plain synth above. Missing data stays silent.</small>
          </span>
        </label>
      </div>

      <div className="sound-profile__effects">
        <span>Effects</span>
        {tags.length === 0
          ? <em>None — dry voice</em>
          : tags.map((tag) => <em key={tag}>{tag}</em>)}
      </div>
    </section>
  );
}
