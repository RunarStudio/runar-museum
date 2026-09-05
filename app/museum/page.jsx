import MuseumLoader from '../../components/MuseumLoader.jsx';
import { getMuseumRooms, getRoomBoards } from '../../lib/data.js';

export default function MuseumPage() {
  const rooms = getMuseumRooms();
  const boardsByRoom = Object.fromEntries(rooms.map((r) => [r.slug, getRoomBoards(r.slug)]));
  return <MuseumLoader rooms={rooms} boardsByRoom={boardsByRoom} initialRoomSlug={rooms[0]?.slug ?? null} />;
}
