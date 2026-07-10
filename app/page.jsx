import Gallery from '../components/Gallery.jsx';
import { getMinis } from '../lib/data.js';

export default function HomePage() {
  return <Gallery minis={getMinis()} />;
}
