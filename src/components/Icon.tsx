import type { SVGProps } from 'react';

const ICONS = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Z" />
      <path d="M20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7 8h10a4 4 0 0 1 3.8 5.3l-1 3A3 3 0 0 1 16.9 18l-1.4-1h-7l-1.4 1a3 3 0 0 1-2.9-1.7l-1-3A4 4 0 0 1 7 8Z" />
      <path d="M8 11v4M6 13h4" />
      <path d="M16 12h.01M18 14h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5 8h14" />
      <path d="M12 8v5" />
      <path d="m8 21 4-8 4 8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V6h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
      <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
      <path d="m5 14 .6 1.4L7 16l-1.4.6L5 18l-.6-1.4L3 16l1.4-.6L5 14Z" />
    </>
  ),
  'volume-on': (
    <>
      <path d="M4 9h3l4-4v14l-4-4H4V9Z" />
      <path d="M15 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a9 9 0 0 1 0 12" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9h3l4-4v14l-4-4H4V9Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M17 6l3 3M14 9l3 3" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="4" />
      <path d="M12 3v4M9 12h.01M15 12h.01" />
      <path d="M9 16h6" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  save: (
    <>
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  cloud: (
    <>
      <path d="M7 18a4 4 0 0 1-.7-7.9A6 6 0 0 1 18 11a3.5 3.5 0 0 1-.5 7H7Z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  play: <path d="M8 5v14l11-7Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" strokeWidth="2.5" />
    </>
  ),
  restart: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z" />
      <path d="M10 21h4" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3.1 3.8" />
      <path d="M6.4 6.9C4 8.5 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 4.2-.9" />
      <path d="M10.4 10.4a2.5 2.5 0 0 0 3.2 3.2" />
    </>
  ),
  'external-link': (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    </>
  ),
  telescope: (
    <>
      <path d="m4 14 14-8 2 4-14 8-2-4Z" />
      <path d="m12 12 2 8M9 20h6" />
      <path d="m18 6 2-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.6L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.6L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 5 5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 18v3h16v-3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 18v3h16v-3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M7 16v-4M11 16V8M15 16v-6M19 16v-9" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  ruler: (
    <>
      <path d="m4 16 12-12 4 4L8 20l-4-4Z" />
      <path d="m8 12 2 2M11 9l2 2M14 6l2 2" />
    </>
  ),
  run: (
    <>
      <circle cx="15" cy="4.5" r="1.5" />
      <path d="m8 21 2-6 3 2 1 4M13 17l-1-5 3-3-4-1-2 4" />
      <path d="m16 10 3 3M6 13l3-1" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.5" />
      <path d="m10 21 1-6 2 2 1 4M13 17v-5l3-2-4-1-2 4" />
      <path d="m16 10 2 4M8 13l2-1" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 20V4M5 11l7-7 7 7" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M20 12H4M11 5l-7 7 7 7" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16v11H9l-5 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 5h4M11 18h2" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6h7l2 2h9v12H3V6Z" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h.01M17 17h.01" />
    </>
  ),
  scroll: (
    <>
      <path d="M6 4h12v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h6M14 6h6M4 12h10M18 12h2M4 18h2M10 18h10" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
  satellite: (
    <>
      <path d="m9 3 6 6M7 5l4-2 6 6-2 4-8-8Z" />
      <path d="m3 13 8 8M5 19l4-4M19 13l2 2" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0V4Z" />
      <path d="M12 8v7" />
    </>
  ),
  maximize: (
    <>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  record: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  vibrate: (
    <>
      <rect x="8" y="4" width="8" height="16" rx="2" />
      <path d="M4 8v8M20 8v8M2 10v4M22 10v4" />
    </>
  ),
  cyclone: (
    <>
      <path d="M12 12c0-2.5 2-4.5 4.5-4.5S21 9.5 21 12s-2 4.5-4.5 4.5S12 14.5 12 12Z" />
      <path d="M12 12c0 2.5-2 4.5-4.5 4.5S3 14.5 3 12s2-4.5 4.5-4.5S12 9.5 12 12Z" />
    </>
  ),
  activity: <path d="M2 12h4l2-6 4 12 2-6h8" />,
  volcano: (
    <>
      <path d="m3 20 5-9h8l5 9H3Z" />
      <path d="M10 11c0-2 1-3 2-4 1 1 2 2 2 4" />
      <path d="M9 5c.5-1.5 1.5-2 3-2M14 4c.5-1 1.2-1.4 2-1.5" />
    </>
  ),
  waves: (
    <>
      <path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </>
  ),
  flame: (
    <>
      <path d="M12 22c4 0 7-2.7 7-6.5 0-3.5-2-5.5-4-7.5-.5 2-1.5 3-3 3.5.5-4-1-7-4-9 0 4-3 6.5-3 11.5C5 18.6 8 22 12 22Z" />
      <path d="M12 22c-1.7 0-3-1.3-3-3 0-1.5 1-2.5 3-4 2 1.5 3 2.5 3 4 0 1.7-1.3 3-3 3Z" />
    </>
  ),
  'cloud-rain': (
    <>
      <path d="M7 16a4 4 0 0 1-.7-7.9A6 6 0 0 1 18 9a3.5 3.5 0 0 1-.5 7H7Z" />
      <path d="M8 19v2M12 19v2M16 19v2" />
    </>
  ),
  mountain: (
    <>
      <path d="m3 20 6-11 4 6 3-4 5 9H3Z" />
      <path d="m9 9 2 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2c3 2.5 4.5 6 4.5 10L14 16h-4l-2.5-4C7.5 8 9 4.5 12 2Z" />
      <circle cx="12" cy="9" r="1.6" />
      <path d="M7.5 12 5 15l3 1M16.5 12 19 15l-3 1M10.5 18.5 12 22l1.5-3.5" />
    </>
  ),
  blackhole: (
    <>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="10" ry="3.4" />
      <path d="M5.5 9.2a7 7 0 0 1 13 0" />
    </>
  ),
  bigbang: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M19 5l-2.8 2.8M7.8 16.2 5 19" />
    </>
  ),
  helmet: (
    <>
      <path d="M4 14a8 8 0 0 1 16 0v4H4v-4Z" />
      <path d="M8 14h8M7 18v2M17 18v2" />
    </>
  ),
  cap: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0H4Z" />
      <path d="M4 13h16v2H4zM8 15v5" />
    </>
  ),
  hair: (
    <>
      <circle cx="12" cy="11" r="6" />
      <path d="M6 10c0-4 2.5-6 6-6s6 2 6 6M7 8c-1 2-1 4 0 6M17 8c1 2 1 4 0 6" />
      <path d="M8 21c.5-2 1.8-3 4-3s3.5 1 4 3" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  'rotate-ccw': (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  scuba: (
    <>
      <path d="M3 8h12v6H3V8Z" />
      <path d="M6 8V6h6v2M15 10h3l3-4" />
      <path d="M6 14v3M12 14v3" />
    </>
  ),
  car: (
    <>
      <path d="M4 15h16l-1.5-5h-13L4 15Z" />
      <path d="M5 15v3M19 15v3M7 18h2M15 18h2" />
      <circle cx="7" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  helicopter: (
    <>
      <path d="M3 6h18M12 6v3" />
      <path d="M6 13a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3H6v-3Z" />
      <path d="M9 16v3M16 16v3M4 19h5M15 19h5" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height' | 'title'> {
  name: IconName;
  title?: string;
}

export function Icon({ name, title, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={className ? `icon ${className}` : 'icon'}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {ICONS[name]}
    </svg>
  );
}
