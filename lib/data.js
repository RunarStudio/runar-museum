import minis from '../content/minis.json';
import { BASE_PATH } from '../site.config.mjs';

export function getMinis() {
  return minis;
}

export function getMini(slug) {
  return minis.find((m) => m.slug === slug);
}

// Static assets under public/ need the basePath prefixed manually on <img> tags.
export function asset(relPath) {
  if (!relPath) return `${BASE_PATH}/images/placeholder.svg`;
  return `${BASE_PATH}/${relPath}`;
}
