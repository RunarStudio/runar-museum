import RoomDeck from '../../../components/RoomDeck.jsx';
import { getRooms, getRoomMinis } from '../../../lib/data.js';

export function generateStaticParams() {
  return getRooms().map((r) => ({ room: r.slug }));
}

export async function generateMetadata({ params }) {
  const { room } = await params;
  const match = getRooms().find((r) => r.slug === room);
  if (!match) return {};
  return {
    title: match.name,
    description: `${match.name} — painted miniatures by Runar Studio.`,
  };
}

export default async function RoomPage({ params }) {
  const { room } = await params;
  const match = getRooms().find((r) => r.slug === room);
  return <RoomDeck roomName={match?.name ?? room} minis={getRoomMinis(room)} />;
}
