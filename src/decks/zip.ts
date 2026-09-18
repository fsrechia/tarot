/**
 * Custom decks imported from a ZIP file and stored in IndexedDB.
 *
 * Accepted ZIP layout (folders are ignored, matching is by file name):
 *   00.webp … 21.webp   card fronts (png / jpg / jpeg / avif / gif also work; "0.png" == "00")
 *   back.webp           optional card back
 *   manifest.json       optional: { "name": "...", "fit": "cover" | "contain", "credits": "..." }
 */
import JSZip from 'jszip';
import { createStore, del, entries, set } from 'idb-keyval';
import type { DeckDef } from '../engine/types';

export interface CustomDeckRecord {
  /** Record shape version (absent on decks imported before it was added). */
  version?: 1;
  id: string;
  name: string;
  family: string;
  cards: string[];
  hasBack: boolean;
  aspectRatio: number;
  fit: 'cover' | 'contain';
  credits?: string;
  /** cardId (or 'back') → image blob */
  blobs: Record<string, Blob>;
  createdAt: number;
}

const store = typeof indexedDB !== 'undefined' ? createStore('tarot', 'decks') : undefined;

const IMAGE_RE = /(?:^|\/)(\d{1,2}|back)\.(webp|png|jpe?g|avif|gif)$/i;
const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif', gif: 'image/gif' };

async function measureAspect(blob: Blob): Promise<number> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      const ratio = bmp.width / bmp.height;
      bmp.close();
      return ratio;
    }
  } catch {
    /* fall through */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth / img.naturalHeight || 0.6);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0.6);
    };
    img.src = url;
  });
}

export async function importZip(file: File, family: string, validIds: string[]): Promise<CustomDeckRecord> {
  const zip = await JSZip.loadAsync(file);
  const blobs: Record<string, Blob> = {};
  let manifest: { name?: string; fit?: 'cover' | 'contain'; credits?: string } = {};

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (/(?:^|\/)manifest\.json$/i.test(entry.name)) {
      try {
        manifest = JSON.parse(await entry.async('string'));
      } catch {
        /* ignore bad manifest */
      }
      continue;
    }
    const m = IMAGE_RE.exec(entry.name);
    if (!m) continue;
    const rawKey = m[1]!.toLowerCase();
    const key = rawKey === 'back' ? 'back' : rawKey.padStart(2, '0');
    if (key !== 'back' && !validIds.includes(key)) continue;
    const ext = m[2]!.toLowerCase();
    blobs[key] = new Blob([await entry.async('arraybuffer')], { type: MIME[ext] ?? 'image/*' });
  }

  const cards = validIds.filter((id) => blobs[id]);
  if (cards.length === 0) throw new Error('no-cards');

  const sample = blobs[cards[0]!]!;
  const aspectRatio = await measureAspect(sample);
  const name = (manifest.name || file.name.replace(/\.zip$/i, '')).trim() || 'Custom deck';
  const id = `custom-${Date.now().toString(36)}`;

  return {
    version: 1,
    id,
    name,
    family,
    cards,
    hasBack: Boolean(blobs['back']),
    aspectRatio,
    fit: manifest.fit === 'contain' ? 'contain' : 'cover',
    credits: manifest.credits,
    blobs,
    createdAt: Date.now(),
  };
}

export async function saveCustomDeck(record: CustomDeckRecord): Promise<void> {
  if (!store) return;
  await set(record.id, record, store);
}

export async function loadCustomDecks(): Promise<CustomDeckRecord[]> {
  if (!store) return [];
  try {
    const all = await entries<string, CustomDeckRecord>(store);
    return all.map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function deleteCustomDeck(id: string): Promise<void> {
  if (!store) return;
  await del(id, store);
}

/** Creates object URLs for a record. Call `revokeDeck` when done with it. */
export function toDeckDef(record: CustomDeckRecord, fallbackDeckId?: string): DeckDef {
  const urls: Record<string, string> = {};
  for (const [key, blob] of Object.entries(record.blobs)) urls[key] = URL.createObjectURL(blob);
  return {
    id: record.id,
    name: record.name,
    family: record.family,
    cards: record.cards,
    hasBack: record.hasBack,
    fallbackDeckId,
    aspectRatio: record.aspectRatio,
    fit: record.fit,
    credits: record.credits,
    custom: true,
    source: { type: 'blob', urls },
  };
}

export function revokeDeck(deck: DeckDef): void {
  if (deck.source.type !== 'blob') return;
  for (const url of Object.values(deck.source.urls)) URL.revokeObjectURL(url);
}
