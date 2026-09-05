'use client';

import dynamic from 'next/dynamic';
import { useLang } from '../lib/i18n.jsx';

// The codebase's first dynamic import. Required, not a style choice:
// WebGL APIs don't exist during static export, so Museum.jsx (and the
// three.js it pulls in) must never be evaluated server-side.
const Museum = dynamic(() => import('./Museum.jsx'), {
  ssr: false,
  loading: () => <MuseumLoading />,
});

function MuseumLoading() {
  const { t } = useLang();
  return <div className="museum-loading">{t('museum_loading')}</div>;
}

export default function MuseumLoader(props) {
  return <Museum {...props} />;
}
