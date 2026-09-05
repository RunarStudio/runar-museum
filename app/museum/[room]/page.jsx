import MuseumLoader from '../../../components/MuseumLoader.jsx';
import { getMuseumRooms, getRoomBoards } from '../../../lib/data.js';

export function generateStaticParams() {
  return getMuseumRooms().map((r) => ({ room: r.slug }));
}

export async function generateMetadata({ params }) {
  const { room } = await params;
  const match = getMuseumRooms().find((r) => r.slug === room);
  if (!match) return {};
  return {
    title: `${match.name} — 3D museum`,
    description: `Walk through ${match.name} in 3D — painted miniatures by Runar Studio.`,
  };
}

export default async function MuseumRoomPage({ params }) {
  const { room } = await params;
  const rooms = getMuseumRooms();
  const boardsByRoom = Object.fromEntries(rooms.map((r) => [r.slug, getRoomBoards(r.slug)]));
  return <MuseumLoader rooms={rooms} boardsByRoom={boardsByRoom} initialRoomSlug={room} />;
}
