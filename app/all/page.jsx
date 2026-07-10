import Gallery from '../../components/Gallery.jsx';
import { getMinis } from '../../lib/data.js';

export const metadata = { title: 'Collection' };

export default function AllPage() {
  return <Gallery minis={getMinis()} />;
}
