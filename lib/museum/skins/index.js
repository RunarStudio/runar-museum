import { dungeon } from './dungeon.js';
import { matrix } from './matrix.js';

export const skins = { dungeon, matrix };
// Matrix is the front door: it is the more striking of the two and the one
// that reads as a *place* rather than a room. Dungeon stays one click away.
export const defaultSkinId = 'matrix';
