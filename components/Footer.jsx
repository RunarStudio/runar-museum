'use client';

import { useLang } from '../lib/i18n.jsx';

export default function Footer() {
  const { t } = useLang();
  return (
    <footer className="site-footer">
      <p>
        © {new Date().getFullYear()} {t('footer')}
      </p>
    </footer>
  );
}
