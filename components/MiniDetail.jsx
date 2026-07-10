'use client';

import Link from 'next/link';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';
import { CONTACT_URL } from '../site.config.mjs';

export default function MiniDetail({ mini }) {
  const { t, lang } = useLang();
  if (!mini) return null;

  const tags = [
    mini.warband && { label: mini.warband },
    mini.game && { label: mini.game },
    ...mini.topics.map((x) => ({ label: x })),
    ...mini.techniques.map((x) => ({ label: x })),
  ].filter(Boolean);

  return (
    <article className="mini-detail">
      <Link href="/" className="back-link">
        {t('back_to_gallery')}
      </Link>

      <div className="detail-layout">
        <div className="detail-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset(mini.cover)} alt={mini.name} />
        </div>

        <div className="detail-info">
          <h1>{mini.name}</h1>
          {mini.forSale && (
            <p className="badge inline">
              {t('for_sale')}
              {mini.price != null ? ` · ${mini.price}€` : ''}
            </p>
          )}
          {mini.datePainted && (
            <p className="painted-date">
              {t('painted_on')}:{' '}
              {new Date(mini.datePainted).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                year: 'numeric',
                month: 'long',
              })}
            </p>
          )}
          <div className="tag-row">
            {tags.map((tag) => (
              <span key={tag.label} className="tag">
                {tag.label}
              </span>
            ))}
          </div>
          {mini.notes && <p className="notes">{mini.notes}</p>}
          <a className="cta" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            {mini.forSale ? t('sold_via') : ''} {t('commission_cta')}
          </a>
        </div>
      </div>

      {mini.process.length > 0 && (
        <section className="process">
          <h2>{t('process_title')}</h2>
          <ol className="process-steps">
            {mini.process.map((src, i) => (
              <li key={src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(src)} alt={`${mini.name} — WIP ${i + 1}`} loading="lazy" />
                <span className="step-number">{i + 1}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
