import Entrance from '../components/Entrance.jsx';
import { getEntranceMinis, getRooms } from '../lib/data.js';

export default function HomePage() {
  return <Entrance entranceMinis={getEntranceMinis()} rooms={getRooms()} />;
}
