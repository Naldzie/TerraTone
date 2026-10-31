/* SimArt — hand-drawn procedural SVG scenes for every simulator card.
 *
 * Inline SVG keeps the art offline-safe (no image files, no external requests,
 * no copyright issues) and scales crisply on any screen. Each scene uses its
 * sim's accent palette so cards, minimap markers, and sim HUD feel related.
 */
import { useId } from 'react';
import type { HazardId } from '../sim/hazards';

export type SimArtId = HazardId | 'tornado';

export function SimArt({ id, className }: { id: SimArtId; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const g = (name: string) => `${id}-${name}-${uid}`;
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label={LABELS[id]} preserveAspectRatio="xMidYMid slice">
      {id === 'tornado' && (
        <>
          <defs>
            <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#232b3d" />
              <stop offset="1" stopColor="#3a4557" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sky')})`} />
          <ellipse cx="160" cy="22" rx="210" ry="42" fill="#161c29" opacity="0.85" />
          <ellipse cx="80" cy="30" rx="90" ry="26" fill="#1e2534" opacity="0.9" />
          <ellipse cx="250" cy="26" rx="80" ry="24" fill="#1e2534" opacity="0.9" />
          <path d="M143 34 C138 66 120 108 108 172 L132 172 C146 116 160 76 172 36 Z" fill="#6b7488" />
          <path d="M152 36 C148 70 136 110 124 172 L132 172 C146 116 160 76 172 36 Z" fill="#8a93a8" opacity="0.7" />
          <ellipse cx="150" cy="62" rx="20" ry="7" fill="none" stroke="#c3cbdc" strokeWidth="2" opacity="0.75" />
          <ellipse cx="139" cy="104" rx="16" ry="6" fill="none" stroke="#c3cbdc" strokeWidth="2" opacity="0.7" />
          <ellipse cx="128" cy="144" rx="13" ry="5" fill="none" stroke="#c3cbdc" strokeWidth="2" opacity="0.65" />
          <rect x="60" y="88" width="6" height="3" rx="1" fill="#d8e0e8" opacity="0.8" transform="rotate(-18 63 89)" />
          <rect x="236" y="70" width="7" height="3" rx="1" fill="#d8e0e8" opacity="0.7" transform="rotate(24 239 71)" />
          <rect x="208" y="120" width="5" height="3" rx="1" fill="#d8e0e8" opacity="0.6" transform="rotate(-32 210 121)" />
          <rect y="160" width="320" height="20" fill="#2c3428" />
        </>
      )}
      {id === 'hurricane' && (
        <>
          <defs>
            <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14304a" />
              <stop offset="1" stopColor="#1f4a6a" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sky')})`} />
          <path d="M172 34 A66 66 0 1 0 96 96" fill="none" stroke="#22d3ee" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
          <path d="M190 58 A88 88 0 1 1 76 122" fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
          <circle cx="176" cy="82" r="7" fill="#e8fbff" />
          <circle cx="176" cy="82" r="12" fill="none" stroke="#a5f3fc" strokeWidth="1.5" opacity="0.6" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <line key={i} x1={20 + i * 40} y1={18 + (i % 3) * 8} x2={4 + i * 40} y2={64 + (i % 3) * 8} stroke="#9fc0d8" strokeWidth="1.5" opacity="0.5" />
          ))}
          <path d="M0 140 Q80 128 160 140 T320 140 L320 180 L0 180 Z" fill="#14506e" />
          <path d="M0 148 Q80 138 160 148 T320 148" fill="none" stroke="#e8f4fa" strokeWidth="2" opacity="0.5" />
        </>
      )}
      {id === 'earthquake' && (
        <>
          <defs>
            <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a2440" />
              <stop offset="1" stopColor="#41365c" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sky')})`} />
          {[[42, 78, 34], [86, 60, 42], [138, 88, 28], [176, 70, 36], [222, 92, 26], [258, 66, 44]].map(([x, h, w], i) => (
            <g key={i}>
              <rect x={x} y={150 - h} width={w} height={h} fill="#1d1a2c" />
              <rect x={x + 6} y={150 - h + 8} width="4" height="5" fill="#fbbf24" opacity="0.85" />
              <rect x={x + 16} y={150 - h + 20} width="4" height="5" fill="#fbbf24" opacity="0.6" />
            </g>
          ))}
          <path d="M0 152 L40 152 L52 144 L70 156 L96 146 L118 158 L140 148 L168 156 L196 146 L224 156 L252 148 L282 156 L302 150 L320 154" fill="none" stroke="#e8e4f4" strokeWidth="2.5" strokeLinejoin="round" />
          <rect y="158" width="320" height="8" fill="#0f0d1a" />
          <polyline points="0,170 30,170 40,162 52,176 64,164 78,174 96,166 120,172 150,165 180,171 210,167 240,173 270,168 300,174 320,170" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
          <rect y="176" width="320" height="4" fill="#0a0913" />
          <circle cx="196" cy="120" r="10" fill="#6b6485" opacity="0.35" />
          <circle cx="86" cy="126" r="12" fill="#6b6485" opacity="0.28" />
        </>
      )}
      {id === 'volcano' && (
        <>
          <defs>
            <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b1f2a" />
              <stop offset="1" stopColor="#46313c" />
            </linearGradient>
            <linearGradient id={g('lava')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffca6a" />
              <stop offset="1" stopColor="#ff5a1a" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sky')})`} />
          <circle cx="150" cy="34" r="16" fill="#5a4a54" opacity="0.5" />
          <circle cx="176" cy="20" r="20" fill="#5a4a54" opacity="0.4" />
          <circle cx="138" cy="14" r="14" fill="#5a4a54" opacity="0.35" />
          <path d="M52 160 L156 58 Q160 54 164 58 L268 160 Z" fill="#3a2f35" />
          <path d="M148 62 Q160 56 172 62 L164 74 Q160 70 156 74 Z" fill="#1d1519" />
          <path d="M158 70 Q160 110 150 160 L166 160 Q168 112 164 70 Z" fill={`url(#${g('lava')})`} opacity="0.9" />
          <ellipse cx="161" cy="66" rx="9" ry="4" fill="#ff7a1a" />
          {[[116, 96], [212, 104], [180, 76], [96, 70]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.2" fill="#ffca6a" opacity="0.85" />
          ))}
          <rect y="160" width="320" height="20" fill="#241c20" />
        </>
      )}
      {id === 'ocean' && (
        <>
          <defs>
            <linearGradient id={g('sea')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7ac8e8" />
              <stop offset="0.45" stopColor="#2a7ba8" />
              <stop offset="1" stopColor="#061f33" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sea')})`} />
          <path d="M60 0 L110 0 L60 90 L30 90 Z" fill="#e8fbff" opacity="0.12" />
          <path d="M160 0 L205 0 L150 100 L130 100 Z" fill="#e8fbff" opacity="0.1" />
          <path d="M250 0 L290 0 L240 84 L220 84 Z" fill="#e8fbff" opacity="0.1" />
          <path d="M96 96 Q120 76 168 84 Q212 90 236 74 Q228 92 232 100 Q222 104 214 114 Q190 104 160 106 Q124 110 96 96 Z" fill="#0a2c40" />
          <path d="M236 74 Q248 62 258 72 Q252 76 254 84 Z" fill="#0a2c40" />
          {[[60, 60, 5], [90, 120, 3.5], [140, 140, 4], [230, 130, 3], [270, 96, 4.5]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="#cdeef8" strokeWidth="1.6" opacity="0.55" />
          ))}
          {[[54, 108], [204, 138], [280, 52]].map(([x, y], i) => (
            <g key={i} opacity="0.8">
              <path d={`M${x} ${y} l14 5 l-14 5 z`} fill="#9fd8e8" transform={i === 1 ? `scale(-1,1) translate(${-2 * x - 14},0)` : undefined} />
            </g>
          ))}
          <path d="M0 168 Q60 158 120 166 T240 164 T320 168 L320 180 L0 180 Z" fill="#0a1a28" />
          {[[36, 168], [80, 172], [150, 168], [250, 170]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q-3 -14 2 -22 M${x + 4} ${y} q4 -12 0 -20`} stroke="#2e7b4f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          ))}
        </>
      )}
      {id === 'wildfire' && (
        <>
          <defs>
            <linearGradient id={g('smoke')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a2a22" />
              <stop offset="1" stopColor="#5c3c2a" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('smoke')})`} />
          <circle cx="90" cy="34" r="26" fill="#2c211c" opacity="0.7" />
          <circle cx="150" cy="22" r="34" fill="#332622" opacity="0.7" />
          <circle cx="220" cy="36" r="28" fill="#2c211c" opacity="0.6" />
          <path d="M38 160 L54 112 L70 160 Z" fill="#14100c" />
          <path d="M60 160 L80 100 L100 160 Z" fill="#17120d" />
          <path d="M16 160 L30 126 L44 160 Z" fill="#120e0a" />
          <path d="M120 160 Q116 128 132 116 Q126 138 140 142 Q138 112 158 100 Q152 128 168 132 Q170 104 188 96 Q180 126 200 132 Q206 108 224 102 Q214 132 232 142 L236 160 Z" fill="#d04020" />
          <path d="M136 160 Q134 140 148 132 Q144 148 156 152 Q156 130 172 122 Q168 142 182 146 Q186 126 202 120 Q196 142 212 148 L216 160 Z" fill="#ff7a1a" />
          <path d="M156 160 Q154 148 164 144 Q162 154 170 156 Q172 142 182 138 Q180 150 190 154 L192 160 Z" fill="#ffca6a" />
          {[[110, 90], [200, 76], [252, 110], [84, 66], [168, 56]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#ffb45a" opacity="0.9" />
          ))}
          <rect y="160" width="320" height="20" fill="#1a130e" />
        </>
      )}
      {id === 'tsunami' && (
        <>
          <defs>
            <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1f3a52" />
              <stop offset="1" stopColor="#2b5578" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('sky')})`} />
          <rect y="116" width="320" height="64" fill="#124a66" />
          <path d="M20 118 C26 68 96 46 150 66 C196 84 210 118 236 126 L236 150 C180 142 60 148 20 150 Z" fill="#2d7aa8" />
          <path d="M34 112 C46 74 102 58 142 74 C120 66 78 74 62 112 Z" fill="#7ac8e8" opacity="0.65" />
          <path d="M28 110 C40 76 96 58 144 74" fill="none" stroke="#e8f4fa" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
          {[[84, 74], [120, 62], [60, 88], [156, 68], [40, 96]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.4" fill="#e8f4fa" opacity="0.8" />
          ))}
          <g fill="#8a7f6a">
            <rect x="248" y="88" width="44" height="22" />
            <path d="M244 88 L270 70 L296 88 Z" fill="#6a4a3a" />
            <rect x="252" y="110" width="4" height="30" />
            <rect x="266" y="110" width="4" height="30" />
            <rect x="282" y="110" width="4" height="30" />
          </g>
          <line x1="226" y1="118" x2="302" y2="118" stroke="#a8a8b0" strokeWidth="2.5" />
          <path d="M20 150 Q100 142 180 150 T320 148 L320 180 L0 180 Z" fill="#0d3a52" />
        </>
      )}
      {id === 'blackhole' && (
        <>
          <defs>
            <radialGradient id={g('glow')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.3" stopColor="#ffb070" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ff7030" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={g('disk')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff2d8" />
              <stop offset="0.5" stopColor="#ffa040" />
              <stop offset="1" stopColor="#b8401a" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill="#030308" />
          {[[24, 22], [70, 140], [110, 30], [250, 24], [290, 150], [300, 70], [40, 90], [200, 160], [150, 14], [270, 110]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.3 : 0.8} fill="#eef2ff" opacity="0.85" />
          ))}
          <circle cx="160" cy="90" r="78" fill={`url(#${g('glow')})`} />
          <ellipse cx="160" cy="90" rx="34" ry="30" fill="none" stroke="#ffcf96" strokeWidth="6" opacity="0.9" />
          <ellipse cx="160" cy="92" rx="96" ry="16" fill="none" stroke={`url(#${g('disk')})`} strokeWidth="9" />
          <circle cx="160" cy="90" r="26" fill="#000" />
          <path d="M64 92 Q160 112 256 92" stroke={`url(#${g('disk')})`} strokeWidth="9" fill="none" />
          <circle cx="160" cy="90" r="27.5" fill="none" stroke="#fff4e0" strokeWidth="1.2" opacity="0.9" />
          <path d="M160 64 L160 6" stroke="#9fc0ff" strokeWidth="5" opacity="0.35" strokeLinecap="round" />
          <path d="M160 116 L160 176" stroke="#9fc0ff" strokeWidth="5" opacity="0.35" strokeLinecap="round" />
        </>
      )}
      {id === 'bigbang' && (
        <>
          <defs>
            <radialGradient id={g('bang')} cx="0.2" cy="0.5" r="0.75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.12" stopColor="#ffe9b0" />
              <stop offset="0.3" stopColor="#ff9a4a" />
              <stop offset="0.48" stopColor="#7a2a1a" />
              <stop offset="0.62" stopColor="#120a1e" />
              <stop offset="1" stopColor="#04040c" />
            </radialGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${g('bang')})`} />
          <path d="M150 60 L200 40 L260 70 L300 50 M200 40 L230 110 L290 130 M230 110 L170 140" stroke="#8a7ae0" strokeWidth="1" opacity="0.5" fill="none" />
          {[[200, 40, '#9fc0ff'], [260, 70, '#fff1d8'], [300, 50, '#ffc78a'], [230, 110, '#9fc0ff'], [290, 130, '#ff9a6a'], [170, 140, '#fff1d8'], [150, 60, '#9fc0ff']].map(([x, y, c], i) => (
            <circle key={i} cx={x as number} cy={y as number} r="3" fill={c as string} />
          ))}
          <ellipse cx="262" cy="96" rx="12" ry="5" fill="#ffd9a8" opacity="0.6" transform="rotate(-25 262 96)" />
          <ellipse cx="212" cy="150" rx="9" ry="3.5" fill="#cfe0ff" opacity="0.6" transform="rotate(20 212 150)" />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx="64" cy="90" r={26 + i * 24} fill="none" stroke="#ffe9b0" strokeOpacity={0.35 - i * 0.07} strokeWidth="1.5" />
          ))}
        </>
      )}
      {id === 'sun' && (
        <>
          <defs>
            <radialGradient id={g('sun')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.75" stopColor="#ffc35a" />
              <stop offset="1" stopColor="#ff7a2a" />
            </radialGradient>
            <radialGradient id={g('corona')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.45" stopColor="#ffe2a8" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="320" height="180" fill="#03040c" />
          <path d="M0 120 Q90 60 170 70 T320 30" stroke="#c8c8ff" strokeOpacity="0.12" strokeWidth="34" fill="none" />
          <path d="M0 122 Q90 62 170 72 T320 32" stroke="#05040a" strokeOpacity="0.45" strokeWidth="4" fill="none" />
          {[[22, 20], [60, 44], [104, 14], [140, 104], [212, 22], [252, 92], [296, 60], [36, 96], [180, 40], [278, 16], [120, 60], [306, 110]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 1.4 : 0.8} fill="#eef2ff" opacity="0.85" />
          ))}
          <circle cx="198" cy="62" r="64" fill={`url(#${g('corona')})`} />
          <circle cx="198" cy="62" r="36" fill={`url(#${g('sun')})`} />
          <circle cx="186" cy="54" r="3.2" fill="#6a2a10" opacity="0.8" />
          <circle cx="192" cy="56" r="2" fill="#6a2a10" opacity="0.7" />
          <circle cx="212" cy="72" r="2.6" fill="#6a2a10" opacity="0.75" />
          <path d="M226 40 q10 -14 18 -2" stroke="#ff5a6e" strokeWidth="2.4" fill="none" opacity="0.85" />
          <circle cx="58" cy="54" r="13" fill="#1f5a9a" />
          <path d="M50 50 q6 -4 10 0 q-2 6 -8 6 z" fill="#4f7a3a" />
          <ellipse cx="58" cy="43" rx="8" ry="2" fill="none" stroke="#5dff9a" strokeWidth="1.4" opacity="0.8" />
          <path d="M0 150 Q80 136 160 142 T320 138 L320 180 L0 180 Z" fill="#5c5d63" />
          <ellipse cx="96" cy="160" rx="22" ry="5" fill="#2e2f34" />
          <ellipse cx="248" cy="166" rx="14" ry="3.5" fill="#2e2f34" />
          <path d="M134 142 a14 14 0 0 1 28 0 z" fill="#e8ecf2" />
          <rect x="133" y="141" width="30" height="5" fill="#d0d6de" />
        </>
      )}
    </svg>
  );
}

/* Screen-reader labels for each scene. */
const LABELS: Record<SimArtId, string> = {
  tornado: 'Illustration: a tornado funnel touching down under dark storm clouds with flying debris',
  hurricane: 'Illustration: a spiral hurricane with a calm eye over a churning sea',
  earthquake: 'Illustration: a cracked city skyline over a live seismograph trace',
  volcano: 'Illustration: an erupting volcano with a lava river and drifting ash',
  ocean: 'Illustration: a deep-ocean scene with a whale, fish, bubbles, and seagrass',
  wildfire: 'Illustration: a wildfire front with flames, embers, and dark trees under smoke',
  tsunami: 'Illustration: a curling tsunami wave surging past a stilt house on the shore',
  blackhole: 'Illustration: a black hole shadow ringed by light, with a glowing accretion disk lensed over the top and blue jets',
  bigbang: 'Illustration: a white-hot Big Bang glow cooling outward into a cosmic web of stars and galaxies',
  sun: 'Illustration: a spotted Sun with a glowing corona over a lunar observatory, Earth with an aurora and the Milky Way behind',
};

/** Exposed for tests and card coverage checks. */
export const SIM_ART_IDS: SimArtId[] = ['tornado', 'hurricane', 'earthquake', 'volcano', 'ocean', 'wildfire', 'tsunami', 'blackhole', 'bigbang', 'sun'];
