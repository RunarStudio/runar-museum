'use client';

import { useLang } from '../lib/i18n.jsx';
import { CONTACT_URL } from '../site.config.mjs';

export default function CommissionsContent() {
  const { t } = useLang();
  return (
    <div className="page-content">
      <h1>{t('commissions_title')}</h1>
      <p>{t('commissions_intro')}</p>
      <a className="cta" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
        {t('commissions_button')}
      </a>
    </div>
  );
}
