'use client';

import { useLang } from '../lib/i18n.jsx';

export default function AboutContent() {
  const { t } = useLang();
  return (
    <div className="page-content">
      <h1>{t('about_title')}</h1>
      <p>{t('about_body')}</p>
      {/* TODO(Ryuu): personal intro text, studio photos, and social links go here. */}
    </div>
  );
}
