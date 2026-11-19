// main.ts — GTA 6 meme entry for make.fun's "Post a GTA 6 meme on X" bounty.
//
// What it does, deterministically, with Node 22 stdlib only and no network:
//   1. Copies POST.json from the repository root to the output directory.
//   2. Renders the meme picture (the same joke as the posted meme: a skeleton
//      gamer who waited 13 years for GTA 6, while make.fun's ghost already
//      got paid) as a PNG and writes it to the output directory as meme.png.
//
// The posted picture itself lives in the repository's sibling entry folder
// (meme.png next to this repo) and is what gets posted on X; this program
// redraws the same joke from scratch so its output is reproducible byte for
// byte: no clock, no randomness, no network, fixed zlib level.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGB, 8-bit, no filtering). Deterministic by design:
// the same pixels always compress to the same bytes at a fixed level.
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: a plain RGB pixel buffer with small shape helpers.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly px: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height * 3);
  }

  set(x: number, y: number, [r, g, b]: RGB): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const o = (iy * this.width + ix) * 3;
    this.px[o] = r;
    this.px[o + 1] = g;
    this.px[o + 2] = b;
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let iy = y0; iy < y1; iy++) {
      for (let ix = x0; ix < x1; ix++) {
        const o = (iy * this.width + ix) * 3;
        this.px[o] = color[0];
        this.px[o + 1] = color[1];
        this.px[o + 2] = color[2];
      }
    }
  }

  // Vertical gradient: top colour lerps into bottom colour.
  fillGradientRect(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
    for (let iy = 0; iy < h; iy++) {
      const t = h <= 1 ? 0 : iy / (h - 1);
      const c: RGB = [
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t),
      ];
      this.fillRect(x, y + iy, w, 1, c);
    }
  }

  fillCircle(cx: number, cy: number, r: number, color: RGB): void {
    const r2 = r * r;
    for (let iy = Math.floor(cy - r); iy <= Math.ceil(cy + r); iy++) {
      for (let ix = Math.floor(cx - r); ix <= Math.ceil(cx + r); ix++) {
        const dx = ix - cx;
        const dy = iy - cy;
        if (dx * dx + dy * dy <= r2) this.set(ix, iy, color);
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: RGB): void {
    for (let iy = Math.floor(cy - ry); iy <= Math.ceil(cy + ry); iy++) {
      for (let ix = Math.floor(cx - rx); ix <= Math.ceil(cx + rx); ix++) {
        const dx = (ix - cx) / rx;
        const dy = (iy - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(ix, iy, color);
      }
    }
  }

  // Scanline polygon fill for a list of [x, y] vertices.
  fillPolygon(points: Array<[number, number]>, color: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let iy = Math.floor(minY); iy <= Math.ceil(maxY); iy++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= iy && y2 > iy) || (y2 <= iy && y1 > iy)) {
          xs.push(x1 + ((iy - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.fillRect(xs[k], iy, xs[k + 1] - xs[k], 1, color);
      }
    }
  }

  // Thick line via repeated circles along the segment.
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: RGB): void {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
    }
  }

  star(cx: number, cy: number, outer: number, inner: number, points: number, color: RGB): void {
    const verts: Array<[number, number]> = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this.fillPolygon(verts, color);
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows of 5 bits, most significant bit left.
// Only the characters the meme's captions need, plus digits for the years.
// ---------------------------------------------------------------------------

const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b01110, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
};

function drawGlyph(c: Canvas, ch: string, x: number, y: number, scale: number, color: RGB): void {
  const rows = FONT[ch];
  if (!rows) return;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r] & (1 << (4 - col))) {
        c.fillRect(x + col * scale, y + r * scale, scale, scale, color);
      }
    }
  }
}

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

// Centred text with a thick outline: black first, shifted in 8 directions,
// then the fill colour on top. Readable even shrunk to 480 px.
function drawTextAt(c: Canvas, text: string, x: number, y: number, scale: number, color: RGB): void {
  let cx = x;
  for (const ch of text) {
    drawGlyph(c, ch, cx, y, scale, color);
    cx += 6 * scale;
  }
}

function drawCaption(c: Canvas, text: string, y: number, scale: number, fill: RGB, outline: RGB): void {
  const w = textWidth(text, scale);
  const x0 = Math.round((c.width - w) / 2);
  const offsets: Array<[number, number]> = [
    [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2],
  ];
  for (const [dx, dy] of offsets) {
    drawTextAt(c, text, x0 + dx, y + dy, scale, outline);
  }
  drawTextAt(c, text, x0, y, scale, fill);
}

// ---------------------------------------------------------------------------
// The meme scene, 1024 x 1024.
// Top band: "ME: I'LL JUST WAIT / PATIENTLY FOR GTA 6"
// Middle: a dusty bedroom. A skeleton gamer slumps in his chair under a
// calendar whose pages fly off, 2013 to 2026. Through the window: a Vice
// City sunset. make.fun's white ghost floats in, holding its magenta star
// coin, already paid while the gamer waited.
// Bottom band: "MY AI AGENT ON MAKE.FUN: / ALREADY GOT PAID"
// ---------------------------------------------------------------------------

const BEIGE: RGB = [233, 223, 194];
const INK: RGB = [20, 16, 14];
const PAPER: RGB = [255, 255, 255];
const GHOST_WHITE: RGB = [250, 250, 250];
const MAGENTA: RGB = [214, 38, 140];
const MAGENTA_DARK: RGB = [150, 20, 95];

function drawScene(c: Canvas): void {
  // Backdrop.
  c.fillRect(0, 0, 1024, 1024, BEIGE);
  c.fillGradientRect(0, 196, 1024, 632, [58, 46, 40], [32, 25, 22]);

  // --- Window with a Vice City sunset, right side. ---
  c.fillRect(592, 224, 392, 400, [60, 30, 40]);
  c.fillGradientRect(604, 236, 368, 376, [255, 158, 74], [255, 94, 122]);
  c.fillGradientRect(604, 420, 368, 192, [255, 94, 122], [122, 63, 160]);
  c.fillCircle(700, 400, 58, [255, 215, 106]); // low sun, clear of the frame bar
  // City skyline silhouettes.
  const skyline: Array<[number, number, number, number]> = [
    [604, 520, 44, 92], [652, 480, 36, 132], [692, 540, 52, 72],
    [748, 500, 40, 112], [792, 548, 60, 64], [856, 492, 38, 120],
    [898, 532, 44, 80], [946, 512, 26, 100],
  ];
  for (const [x, y, w, h] of skyline) c.fillRect(x, y, w, h, [48, 22, 52]);
  // Palm silhouettes.
  c.line(640, 612, 652, 500, 10, [48, 22, 52]);
  for (const [dx, dy] of [[-38, -28], [-18, -44], [4, -48], [26, -40], [42, -22]] as Array<[number, number]>) {
    c.line(652, 500, 652 + dx, 500 + dy, 7, [48, 22, 52]);
  }
  c.line(936, 612, 924, 516, 10, [48, 22, 52]);
  for (const [dx, dy] of [[-40, -20], [-20, -40], [2, -46], [24, -38], [40, -24]] as Array<[number, number]>) {
    c.line(924, 516, 924 + dx, 516 + dy, 7, [48, 22, 52]);
  }
  // Window frame.
  c.fillRect(592, 224, 392, 12, [60, 30, 40]);
  c.fillRect(592, 612, 392, 12, [60, 30, 40]);
  c.fillRect(592, 224, 12, 400, [60, 30, 40]);
  c.fillRect(972, 224, 12, 400, [60, 30, 40]);
  c.fillRect(782, 224, 10, 400, [60, 30, 40]);

  // --- Wall calendar, left, and the years flying off it. ---
  c.fillRect(88, 248, 190, 150, PAPER);
  c.fillRect(88, 248, 190, 10, [40, 36, 34]);
  for (let i = 0; i < 4; i++) c.fillRect(104 + i * 44, 268, 2, 120, [200, 196, 188]);
  for (let i = 0; i < 3; i++) c.fillRect(96, 292 + i * 34, 174, 2, [200, 196, 188]);
  drawTextAt(c, '2013', 120, 306, 3, INK);
  // Flying pages, each a tilted white slip with a year.
  const pages: Array<[number, number, string, number]> = [
    [300, 250, '2014', 0], [380, 300, '2015', 0], [300, 330, '2016', 0],
    [420, 240, '2017', 0], [470, 320, '2019', 0], [330, 410, '2026', 0],
  ];
  for (const [x, y, year] of pages) {
    c.fillRect(x, y, 74, 44, PAPER);
    c.fillRect(x, y, 74, 4, [180, 176, 168]);
    let tx = x + 8;
    for (const ch of year) {
      drawGlyph(c, ch, tx, y + 12, 3, INK);
      tx += 18;
    }
  }

  // --- "GTA V — STILL LOADING" poster, far left. ---
  c.fillRect(48, 440, 120, 110, [232, 220, 180]);
  c.fillRect(48, 440, 120, 8, INK);
  let tx = 60;
  for (const ch of 'GTA V') {
    drawGlyph(c, ch, tx, 462, 3, INK);
    tx += 18;
  }
  tx = 60;
  for (const ch of '13 YEARS') {
    drawGlyph(c, ch, tx, 500, 2, INK);
    tx += 12;
  }

  // --- Desk and keyboard, bottom of the scene. ---
  c.fillRect(40, 700, 944, 128, [107, 74, 51]);
  c.fillRect(40, 700, 944, 10, [140, 100, 66]);
  c.fillRect(400, 730, 320, 66, [30, 28, 30]);
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 12; col++) {
      c.fillRect(414 + col * 25, 740 + r * 19, 18, 12, [90, 88, 92]);
    }
  }
  c.fillEllipse(340, 762, 26, 16, [40, 38, 40]); // mouse

  // --- The skeleton gamer, centre-left. ---
  // Chair back.
  c.fillEllipse(330, 560, 130, 170, [52, 44, 60]);
  c.fillEllipse(330, 560, 108, 148, [70, 58, 78]);
  // Hooded body.
  c.fillPolygon([[230, 828], [260, 560], [400, 560], [430, 828]], [58, 54, 60]);
  // Skull.
  c.fillCircle(330, 480, 62, [240, 236, 224]);
  c.fillCircle(308, 470, 16, INK); // eye sockets
  c.fillCircle(352, 470, 16, INK);
  c.fillPolygon([[330, 492], [320, 510], [340, 510]], INK); // nose
  for (let i = 0; i < 5; i++) c.fillRect(302 + i * 12, 522, 3, 14, INK); // teeth
  // Hood rim.
  c.fillCircle(330, 480, 74, [58, 54, 60]);
  c.fillCircle(330, 486, 62, [240, 236, 224]);
  c.fillCircle(308, 472, 15, INK);
  c.fillCircle(352, 472, 15, INK);
  c.fillPolygon([[330, 494], [321, 510], [339, 510]], INK);
  for (let i = 0; i < 5; i++) c.fillRect(303 + i * 12, 522, 3, 13, INK);
  // Bony arms to the keyboard.
  c.line(268, 640, 380, 742, 26, [58, 54, 60]);
  c.line(392, 640, 470, 740, 26, [58, 54, 60]);
  c.fillCircle(382, 744, 16, [240, 236, 224]);
  c.fillCircle(472, 742, 16, [240, 236, 224]);

  // --- Cobwebs in the corners. ---
  const web: RGB = [210, 205, 195];
  for (const [x1, y1, x2, y2] of [
    [40, 196, 200, 340], [40, 196, 260, 230], [40, 196, 120, 420],
    [984, 196, 820, 330], [984, 196, 760, 240], [984, 196, 900, 430],
  ] as Array<[number, number, number, number]>) {
    c.line(x1, y1, x2, y2, 2, web);
  }

  // --- make.fun's ghost, floating in from the right, already paid. ---
  // Raised arm holding the coin.
  c.line(700, 560, 620, 452, 30, GHOST_WHITE);
  c.fillCircle(620, 452, 20, GHOST_WHITE);
  // Body: dome + wavy hem.
  c.fillCircle(760, 520, 118, GHOST_WHITE);
  c.fillRect(642, 520, 236, 96, GHOST_WHITE);
  c.fillCircle(672, 616, 30, GHOST_WHITE);
  c.fillCircle(730, 616, 30, GHOST_WHITE);
  c.fillCircle(788, 616, 30, GHOST_WHITE);
  c.fillCircle(846, 616, 30, GHOST_WHITE);
  // Black outline, drawn as a ring of offset circles behind the white.
  // (Cheap trick: re-draw the silhouette slightly larger in ink first is
  // skipped; the ghost reads clean on the dark room as-is.)
  // Sparkle eyes: four-pointed stars.
  c.star(716, 500, 26, 9, 4, INK);
  c.star(804, 500, 26, 9, 4, INK);
  // Smile.
  c.fillEllipse(760, 556, 26, 14, INK);
  c.fillEllipse(760, 550, 26, 12, GHOST_WHITE);
  // The magenta star coin, held high.
  c.fillCircle(612, 420, 46, MAGENTA_DARK);
  c.fillCircle(612, 420, 40, MAGENTA);
  c.star(612, 420, 30, 12, 5, PAPER);

  // --- Captions. ---
  drawCaption(c, "ME: I'LL JUST WAIT", 30, 7, PAPER, INK);
  drawCaption(c, 'PATIENTLY FOR GTA 6', 108, 7, PAPER, INK);
  drawCaption(c, 'MY AI AGENT ON MAKE.FUN:', 852, 6, PAPER, INK);
  drawCaption(c, 'ALREADY GOT PAID', 930, 7, PAPER, INK);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // The post file: the gate reads POST.json from /output.
  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }

  // The meme picture, redrawn from scratch every run.
  const canvas = new Canvas(1024, 1024);
  drawScene(canvas);
  const png = encodePng(canvas.width, canvas.height, canvas.px);
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
}

main();
