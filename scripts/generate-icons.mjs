// Zero-dependency icon generator. Renders every app icon from the master logo
// public/icons/logo.png, keeping its transparency (no black/white box behind
// the emblem):
//   public/favicon.ico, public/icons/icon-{192,512}.png
//   electron/build/icon.{png,ico,icns}            (Windows / macOS installers)
//   android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png
// Run: node scripts/generate-icons.mjs
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const LOGO = join(iconsDir, 'logo.png');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function toPng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- PNG decode (8-bit RGB/RGBA, non-interlaced) → RGBA -------------------
function decodePng(file) {
  const buf = readFileSync(file);
  let w = 0;
  let h = 0;
  let channels = 0;
  const idat = [];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG (need 8-bit non-interlaced)');
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (!channels) throw new Error('unsupported PNG color type ' + data[9]);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    const bpp = channels;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) throw new Error('unsupported PNG filter ' + filter);
      line[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = line[x * channels];
      out[o + 1] = line[x * channels + 1];
      out[o + 2] = line[x * channels + 2];
      out[o + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

// --- Alpha-correct resampling --------------------------------------------
// Colours are weighted by alpha so transparent pixels never bleed dark or
// light fringes into the edges. Box filter when shrinking, bilinear when growing.
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const put = (d, r, g, b, a) => {
    if (a <= 0) return;
    out[d] = Math.round(r / a);
    out[d + 1] = Math.round(g / a);
    out[d + 2] = Math.round(b / a);
    out[d + 3] = Math.round(a);
  };
  if (dw <= sw) {
    for (let y = 0; y < dh; y++) {
      const y0 = Math.floor((y * sh) / dh);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
      for (let x = 0; x < dw; x++) {
        const x0 = Math.floor((x * sw) / dw);
        const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
        let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const o = (yy * sw + xx) * 4;
            const al = src[o + 3];
            r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al; n++;
          }
        }
        put((y * dw + x) * 4, r, g, b, a);
        out[(y * dw + x) * 4 + 3] = Math.round(a / n);
      }
    }
    return out;
  }
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy); const y1 = Math.min(sh - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx); const x1 = Math.min(sw - 1, x0 + 1); const tx = fx - x0;
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (const [xx, yy, wgt] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
        const o = (yy * sw + xx) * 4;
        const al = src[o + 3] * wgt;
        r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
      }
      put((y * dw + x) * 4, r, g, b, a);
    }
  }
  return out;
}

/** Place the logo, scaled to `fill` of the canvas, centred on a transparent square. */
function iconAt(size, fill = 1) {
  const inner = Math.max(1, Math.round(size * fill));
  const art = resize(logo.rgba, logo.w, logo.h, inner, inner);
  if (inner === size) return art;
  const out = Buffer.alloc(size * size * 4);
  const off = Math.floor((size - inner) / 2);
  for (let y = 0; y < inner; y++) art.copy(out, ((y + off) * size + off) * 4, y * inner * 4, (y + 1) * inner * 4);
  return out;
}

// --- ICO container (PNG-compressed entries) ------------------------------
function toIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = Buffer.alloc(16 * entries.length);
  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

// --- ICNS container (PNG-compressed OS X entries) ------------------------
function toIcns(entries) {
  const body = Buffer.concat(
    entries.map((e) => {
      const head = Buffer.alloc(8);
      head.write(e.type, 0, 'ascii');
      head.writeUInt32BE(e.png.length + 8, 4);
      return Buffer.concat([head, e.png]);
    }),
  );
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const logo = decodePng(LOGO);
const png = (size, fill) => toPng(size, size, iconAt(size, fill));
const written = [];
const write = (rel, data) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  written.push(rel);
};

// Web app (manifest icons + favicon). logo.png itself is the source — untouched.
write('public/icons/icon-192.png', png(192));
write('public/icons/icon-512.png', png(512));
write('public/favicon.ico', toIco([16, 32, 48, 64].map((size) => ({ size, png: png(size) }))));

// Desktop installers (electron-builder reads electron/build/).
write('electron/build/icon.png', png(512));
write('electron/build/icon.ico', toIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) }))));
write('electron/build/icon.icns', toIcns(
  [32, 64, 128, 256, 512, 1024].map((size, i) => ({ type: ['ic11', 'ic12', 'ic07', 'ic08', 'ic09', 'ic10'][i], png: png(size) })),
));

// Android launcher icons. Legacy + round: the emblem at ~92 %; adaptive
// foreground: inside the 66 % safe zone so no launcher mask clips it
// (the background colour comes from values/ic_launcher_background.xml).
const res = 'android/app/src/main/res';
if (existsSync(join(root, res))) {
  for (const [dpi, base] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
    write(`${res}/mipmap-${dpi}/ic_launcher.png`, png(base, 0.92));
    write(`${res}/mipmap-${dpi}/ic_launcher_round.png`, png(base, 0.86));
    write(`${res}/mipmap-${dpi}/ic_launcher_foreground.png`, png(Math.round(base * 2.25), 0.62));
  }
}

console.log(`logo ${logo.w}x${logo.h} ->\n  ${written.join('\n  ')}`);
