'use client';

import Link from 'next/link';
import { useLang } from '../lib/i18n.jsx';

export default function Header() {
  const { lang, setLang, t } = useLang();
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        🏛️ Runar Museum
      </Link>
      <nav>
        <Link href="/">{t('nav_gallery')}</Link>
        <Link href="/commissions/">{t('nav_commissions')}</Link>
        <Link href="/about/">{t('nav_about')}</Link>
        <button
          className="lang-toggle"
          onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
          aria-label="Switch language"
        >
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
      </nav>
    </header>
  );
}
