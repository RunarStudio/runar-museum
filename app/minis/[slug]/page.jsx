import { getMinis, getMini } from '../../../lib/data.js';
import MiniDetail from '../../../components/MiniDetail.jsx';

export function generateStaticParams() {
  return getMinis().map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const mini = getMini(slug);
  if (!mini) return {};
  return {
    title: mini.name,
    description: mini.notes || `${mini.name} — painted miniature by Runar Studio.`,
  };
}

export default async function MiniPage({ params }) {
  const { slug } = await params;
  return <MiniDetail mini={getMini(slug)} />;
}
