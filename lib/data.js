import minis from '../content/minis.json';
import { BASE_PATH } from '../site.config.mjs';

const ENTRANCE_ROOM = 'Entrance';
const FALLBACK_ENTRANCE_COUNT = 5;

export function getMinis() {
  return minis;
}

export function getMini(slug) {
  return minis.find((m) => m.slug === slug);
}

export function roomSlug(name) {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'room';
}

// Entrance = minis tagged Room/Wing = Entrance; falls back to the newest
// published minis so the landing page is never empty.
export function getEntranceMinis() {
  const tagged = minis.filter((m) => m.room === ENTRANCE_ROOM);
  if (tagged.length > 0) return tagged;
  return [...minis]
    .filter((m) => m.datePainted)
    .sort((a, b) => new Date(b.datePainted) - new Date(a.datePainted))
    .slice(0, FALLBACK_ENTRANCE_COUNT);
}

// Every distinct Room/Wing value (except Entrance) becomes a room, grouped
// in first-seen order with a door preview image from its first mini.
export function getRooms() {
  const rooms = new Map();
  for (const mini of minis) {
    if (!mini.room || mini.room === ENTRANCE_ROOM) continue;
    if (!rooms.has(mini.room)) {
      rooms.set(mini.room, {
        name: mini.room,
        slug: roomSlug(mini.room),
        count: 0,
        previewImage: mini.thumb ?? mini.cover ?? null,
      });
    }
    rooms.get(mini.room).count += 1;
  }
  return [...rooms.values()];
}

export function getRoomMinis(slug) {
  return minis.filter((m) => m.room && m.room !== ENTRANCE_ROOM && roomSlug(m.room) === slug);
}

// Static assets under public/ need the basePath prefixed manually on <img> tags.
export function asset(relPath) {
  if (!relPath) return `${BASE_PATH}/images/placeholder.svg`;
  return `${BASE_PATH}/${relPath}`;
}
