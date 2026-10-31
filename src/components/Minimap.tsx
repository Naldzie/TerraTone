import { useEffect, useRef, useState } from 'react';

export interface MinimapNpc {
  x: number;
  z: number;
  name: string;
  state: 'wandering' | 'fleeing' | 'driving';
}

export interface MinimapEvent {
  x: number;
  z: number;
  kind: 'tornado' | 'eye' | 'crater' | 'front' | 'epicenter' | 'submersible' | 'vehicle' | 'tsunami' | 'gauge' | 'scarp' | 'reservoir' | 'sun' | 'blackhole' | 'bigbang';
  label: string;
  color?: string;
  radius?: number; // draw ring of this radius around the event
}

export interface MinimapFocus {
  x: number;
  z: number;
  color: string;
  label: string;
}

export interface MinimapProps {
  x: number;
  z: number;
  yaw: number;
  halfSize: number;
  size?: number;
  markers?: { x: number; z: number; color: string; label?: string }[];
  npcs?: MinimapNpc[];
  events?: MinimapEvent[];
  focus?: MinimapFocus;
  temperature?: number;
  condition?: string;
  className?: string;
}

/** Full-detail tactical mini map: world boundary, distance rings, player,
 *  NPCs (wander/flee/drive), hazard events, temperature readout, compass. */
export function Minimap({
  x, z, yaw, halfSize, size: requestedSize = 220, markers = [], npcs = [], events = [], focus,
  temperature, condition,
  className,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(requestedSize);

  // The stylesheet decides how large the map is on each screen; draw at the
  // measured CSS size so text and markers stay legible instead of being clipped.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const w = Math.round(canvas.clientWidth);
      if (w > 0) setSize(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [requestedSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tiny = size < 120;
    const pad = tiny ? 7 : 10;
    const inner = size - pad * 2;
    const scale = inner / (halfSize * 2);
    const cx = size / 2;
    const cy = size / 2;

    const C = {
      world: 'rgba(34, 211, 238, 0.25)',
      ring: 'rgba(34, 211, 238, 0.14)',
      ringText: 'rgba(34, 211, 238, 0.45)',
      origin: 'rgba(34, 211, 238, 0.18)',
      player: '#22d3ee',
      npcWander: '#22d3ee',
      npcFlee: '#fb7185',
      npcDrive: '#fbbf24',
      text: '#e8f1ff',
      dim: '#94a3b8',
    };

    // Background + border.
    ctx.fillStyle = '#050b1a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = C.world;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    // Center crosshair (origin).
    ctx.strokeStyle = C.origin;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - inner / 2); ctx.lineTo(cx, cy + inner / 2);
    ctx.moveTo(cx - inner / 2, cy); ctx.lineTo(cx + inner / 2, cy);
    ctx.stroke();

    // Distance rings (quarter / half / full extent).
    ctx.strokeStyle = C.ring;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const ringSteps = [halfSize * 0.25, halfSize * 0.5, halfSize * 0.75, halfSize];
    for (const r of ringSteps) {
      const rad = r * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.ringText;
      ctx.font = `${tiny ? 7 : 9}px ui-monospace, monospace`;
      ctx.fillText(`${Math.round(r)} m`, cx + rad + 2, cy - rad - 4);
    }
    ctx.setLineDash([]);

    // Static markers (buildings / known points).
    for (const m of markers) {
      const mx = cx + m.x * scale;
      const my = cy - m.z * scale;
      if (mx < 0 || mx > size || my < 0 || my > size) continue;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hazard events (rings + labeled dots).
    const allEvents = [...events];
    if (focus) allEvents.unshift({
      x: focus.x, z: focus.z, kind: 'vehicle' as any, label: focus.label,
      color: focus.color, radius: 45,
    });
    for (const ev of allEvents) {
      const ex = cx + ev.x * scale;
      const ey = cy - ev.z * scale;
      if (ex < -40 || ex > size + 40 || ey < -40 || ey > size + 40) continue;
      const color = ev.color ?? eventColor(ev.kind);
      // Range ring.
      if (ev.radius) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(ex, ey, ev.radius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Event dot (pulse size by intensity via label length trick kept steady).
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label.
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${tiny ? 8 : 10}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(ev.label, ex, ey - (tiny ? 7 : 9));
    }

    // NPCs.
    for (const n of npcs) {
      const nx = cx + n.x * scale;
      const ny = cy - n.z * scale;
      if (nx < -6 || nx > size + 6 || ny < -6 || ny > size + 6) continue;
      ctx.fillStyle = npcColor(n.state);
      ctx.beginPath();
      ctx.arc(nx, ny, n.state === 'driving' ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (n.state === 'driving') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(nx, ny, tiny ? 1.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player dot + heading.
    const px = cx + x * scale;
    const py = cy - z * scale;
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Heading arrow.
    const arrowLen = tiny ? 12 : 18;
    const ax = px + Math.sin(yaw) * arrowLen;
    const ay = py + Math.cos(yaw) * arrowLen;
    ctx.strokeStyle = C.player;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.font = `bold ${tiny ? 8 : 10}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('YOU', px, py - (tiny ? 8 : 10));

    // Compass cardinals at the map edge.
    ctx.fillStyle = C.dim;
    ctx.font = `${tiny ? 8 : 10}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, pad + 9);
    ctx.fillText('S', cx, size - pad + 9);
    ctx.textAlign = 'start';
    ctx.fillText('E', size - pad - 5, cy + 4);
    ctx.textAlign = 'end';
    ctx.fillText('W', pad + 5, cy + 4);

    // Temperature + condition readout (bottom-left).
    let ty = size - pad - 2;
    if (temperature != null) {
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(pad + 1, ty - 10, 3, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pad + 2.5, ty - 1, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold ${tiny ? 9 : 12}px ui-monospace, monospace`;
      ctx.textAlign = 'start';
      ctx.fillText(`${temperature}°C`, pad + 9, ty);
      ty -= tiny ? 11 : 14;
    }
    if (condition && !tiny) {
      ctx.fillStyle = C.text;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'start';
      const maxW = size - pad * 2;
      let label = condition;
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(`${label}…`).width > maxW) {
          label = label.slice(0, -1);
        }
        label = `${label}…`;
      }
      ctx.fillText(label, pad, ty);
    }
    if (condition) {
      ctx.fillStyle = C.text;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(condition, pad, ty);
    }

  }, [x, z, yaw, halfSize, size, markers, npcs, events, focus, temperature, condition]);

  return (
    <canvas
      ref={canvasRef}
      className={`minimap ${className ?? ''}`}
      aria-label="Full-detail mini map: your position, bystander NPCs, hazard events, temperature and compass"
    />
  );
}

function eventColor(kind: string): string {
  switch (kind) {
    case 'tornado': return '#ffd23f';
    case 'eye': return '#22d3ee';
    case 'crater': return '#fb7185';
    case 'front': return '#ff7a1a';
    case 'epicenter': return '#a78bfa';
    case 'submersible': return '#5ff5d2';
    case 'vehicle': return '#fbbf24';
    case 'tsunami': return '#4aa8e8';
    case 'gauge': return '#60a5fa';
    case 'scarp': return '#d8a24a';
    case 'reservoir': return '#e8b84a';
    case 'sun': return '#ffb547';
    case 'blackhole': return '#c084fc';
    case 'bigbang': return '#fde68a';
    default: return '#94a3b8';
  }
}

function npcColor(state: string): string {
  switch (state) {
    case 'fleeing': return '#fb7185';
    case 'driving': return '#fbbf24';
    case 'wandering':
    default: return '#22d3ee';
  }
}
