#!/usr/bin/env node
/**
 * Generates the generic Minor Arcana artwork for the `standard` deck and the
 * Minor Arcana backs for the static decks (docs/plans/minor-arcana.md).
 *
 *   node scripts/gen-minor-cards.mjs
 *
 * Fronts are drawn as SVG (roman numeral, pip layout, suit colours, court
 * title) and rasterised with sharp (already in node_modules through Astro).
 * Backs are hue-shifted variants of the painted back so Major and Minor
 * cards are told apart at a glance while sharing one style.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/decks');
const W = 627;
const H = 1024; // same size as the standard Major Arcana scans (aspect 0.612)

const SUITS = {
  wands: { color: '#b4531d', dark: '#6e2f0d', name: 'WANDS' },
  cups: { color: '#2f6f9f', dark: '#173c5c', name: 'CUPS' },
  swords: { color: '#4d5270', dark: '#262a41', name: 'SWORDS' },
  pentacles: { color: '#3f7a3c', dark: '#1f4420', name: 'PENTACLES' },
};
const RANKS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'page', 'knight', 'queen', 'king'];
const ROMAN = { '01': 'I', '02': 'II', '03': 'III', '04': 'IV', '05': 'V', '06': 'VI', '07': 'VII', '08': 'VIII', '09': 'IX', '10': 'X' };
const WORDS = { '01': 'ACE', '02': 'TWO', '03': 'THREE', '04': 'FOUR', '05': 'FIVE', '06': 'SIX', '07': 'SEVEN', '08': 'EIGHT', '09': 'NINE', '10': 'TEN' };
const COURT = { page: 'PAGE', knight: 'KNIGHT', queen: 'QUEEN', king: 'KING' };
const COURT_MARK = { page: 'P', knight: 'Kn', queen: 'Q', king: 'K' };
const GOLD = '#c9a24a';
const INK = '#2a2420';
const FONT = "'DejaVu Serif', 'Liberation Serif', Georgia, serif";

/** Pip icons in a 100×100 box, centred at (50, 50). */
function pip(suit, color, dark) {
  switch (suit) {
    case 'wands':
      return `
        <line x1="50" y1="10" x2="50" y2="92" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>
        <line x1="50" y1="10" x2="50" y2="92" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
        <ellipse cx="34" cy="30" rx="13" ry="6" transform="rotate(-35 34 30)" fill="#5f8f3a"/>
        <ellipse cx="66" cy="44" rx="13" ry="6" transform="rotate(35 66 44)" fill="#5f8f3a"/>
        <ellipse cx="35" cy="60" rx="12" ry="5.5" transform="rotate(-35 35 60)" fill="#5f8f3a"/>
        <path d="M50 4 C58 12 58 20 50 26 C42 20 42 12 50 4Z" fill="${GOLD}"/>`;
    case 'cups':
      return `
        <path d="M18 22 H82 C82 52 68 62 50 62 C32 62 18 52 18 22Z" fill="${color}" stroke="${dark}" stroke-width="3"/>
        <rect x="45" y="62" width="10" height="16" fill="${dark}"/>
        <path d="M28 90 C28 80 40 78 50 78 C60 78 72 80 72 90Z" fill="${color}" stroke="${dark}" stroke-width="3"/>
        <path d="M24 24 H76" stroke="${GOLD}" stroke-width="4"/>`;
    case 'swords':
      return `
        <path d="M50 4 L58 22 L57 60 H43 L42 22Z" fill="#d9dbe3" stroke="${dark}" stroke-width="2.5"/>
        <path d="M50 8 V58" stroke="#f4f5f8" stroke-width="2"/>
        <rect x="26" y="58" width="48" height="8" rx="3" fill="${GOLD}" stroke="${dark}" stroke-width="2"/>
        <rect x="45" y="66" width="10" height="20" fill="${color}" stroke="${dark}" stroke-width="2"/>
        <circle cx="50" cy="91" r="6" fill="${GOLD}" stroke="${dark}" stroke-width="2"/>`;
    case 'pentacles': {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        return `${(50 + 26 * Math.cos(a)).toFixed(1)},${(50 + 26 * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      return `
        <circle cx="50" cy="50" r="38" fill="${GOLD}" stroke="${dark}" stroke-width="3"/>
        <circle cx="50" cy="50" r="31" fill="none" stroke="${dark}" stroke-width="1.5"/>
        <polygon points="${pts}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`;
    }
  }
  throw new Error(`unknown suit ${suit}`);
}

/** Pip centres for 1–10 as fractions of the inner area (playing-card layouts). */
function layout(n) {
  const L = 0.3;
  const R = 0.7;
  const C = 0.5;
  const rows4 = [0.14, 0.38, 0.62, 0.86];
  const rows3 = [0.16, 0.5, 0.84];
  switch (n) {
    case 1: return [[C, 0.5]];
    case 2: return [[C, 0.2], [C, 0.8]];
    case 3: return [[C, 0.16], [C, 0.5], [C, 0.84]];
    case 4: return [[L, 0.2], [R, 0.2], [L, 0.8], [R, 0.8]];
    case 5: return [[L, 0.2], [R, 0.2], [C, 0.5], [L, 0.8], [R, 0.8]];
    case 6: return rows3.flatMap((y) => [[L, y], [R, y]]);
    case 7: return [...rows3.flatMap((y) => [[L, y], [R, y]]), [C, 0.33]];
    case 8: return [...rows3.flatMap((y) => [[L, y], [R, y]]), [C, 0.33], [C, 0.67]];
    case 9: return [...rows4.flatMap((y) => [[L, y], [R, y]]), [C, 0.5]];
    case 10: return [...rows4.flatMap((y) => [[L, y], [R, y]]), [C, 0.26], [C, 0.74]];
  }
  throw new Error(`no layout for ${n}`);
}

function cardSvg(suit, rank) {
  const { color, dark, name } = SUITS[suit];
  const isCourt = rank in COURT;
  const n = isCourt ? 0 : Number(rank);
  const mark = isCourt ? COURT_MARK[rank] : ROMAN[rank];
  const title = `${isCourt ? COURT[rank] : WORDS[rank]} OF ${name}`;

  // Inner area for pips, leaving room for the corner marks and the title band.
  const inner = { x: 110, y: 150, w: W - 220, h: H - 340 };
  const icon = pip(suit, color, dark);
  let pips = '';
  if (isCourt) {
    const size = 300;
    pips += `<g transform="translate(${W / 2 - size / 2} ${inner.y + inner.h / 2 - size / 2 - 70}) scale(${size / 100})">${icon}</g>`;
    // A ribbon under the figure's icon so courts read differently from pips.
    const ry = inner.y + inner.h - 100;
    pips += `<path d="M${W / 2 - 150} ${ry} h300 l-22 26 l22 26 h-300 l22 -26z" fill="${color}" stroke="${dark}" stroke-width="3"/>`;
    pips += `<text x="${W / 2}" y="${ry + 38}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="bold" fill="#fbf6ea" letter-spacing="6">${COURT[rank]}</text>`;
  } else {
    const size = n === 1 ? 320 : n <= 3 ? 150 : 118;
    for (const [fx, fy] of layout(n)) {
      const cx = inner.x + fx * inner.w;
      const cy = inner.y + fy * inner.h;
      // Pips in the lower half are upside down, as on playing cards.
      const flip = fy > 0.55 && n > 1 ? ` rotate(180 ${size / 2} ${size / 2})` : '';
      pips += `<g transform="translate(${cx - size / 2} ${cy - size / 2})${flip} scale(${size / 100})">${icon}</g>`;
    }
  }

  const corner = (x, y, rot) => `
    <g transform="translate(${x} ${y}) rotate(${rot})">
      <text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-size="${mark.length > 2 ? 40 : 52}" font-weight="bold" fill="${dark}">${mark}</text>
      <g transform="translate(-19 12) scale(0.38)">${icon}</g>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#f7f0e0"/>
      <stop offset="1" stop-color="#e9dcc2"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="34" fill="url(#paper)"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="24" fill="none" stroke="${color}" stroke-width="12"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="16" fill="none" stroke="${GOLD}" stroke-width="3"/>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" rx="12" fill="none" stroke="${dark}" stroke-width="1.5" opacity="0.6"/>
  ${corner(84, 108, 0)}
  ${corner(W - 84, H - 108, 180)}
  ${pips}
  <text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="${FONT}" font-size="28" fill="${INK}" letter-spacing="4">${title}</text>
  <rect x="150" y="${H - 128}" width="${W - 300}" height="1.5" fill="${dark}" opacity="0.5"/>
</svg>`;
}

async function fronts() {
  const dir = path.join(OUT, 'standard');
  await mkdir(dir, { recursive: true });
  for (const suit of Object.keys(SUITS)) {
    for (const rank of RANKS) {
      const file = path.join(dir, `${suit}-${rank}.webp`);
      await sharp(Buffer.from(cardSvg(suit, rank))).webp({ quality: 82 }).toFile(file);
    }
  }
  console.log('fronts: 56 written to', dir);
}

/** Hue-shifted copies of the painted back: emerald/rose for standard, teal/copper for vitoria. */
async function backs() {
  const source = path.join(OUT, 'vitoria/back.webp');
  const variants = [
    { deck: 'standard', hue: 250 },
    { deck: 'vitoria', hue: 300 },
  ];
  for (const { deck, hue } of variants) {
    const file = path.join(OUT, deck, 'back-minor.webp');
    await sharp(source).modulate({ hue, saturation: 0.9 }).webp({ quality: 78 }).toFile(file);
    console.log('back:', file);
  }
}

await fronts();
await backs();
