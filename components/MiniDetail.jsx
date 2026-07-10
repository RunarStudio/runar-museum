'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';
import { CONTACT_URL } from '../site.config.mjs';

export default function MiniDetail({ mini }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [escArmed, setEscArmed] = useState(false); // first Esc pressed, waiting for second
  const escTimer = useRef(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [buttonFocus, setButtonFocus] = useState(null); // null | 'back' | 'commission'

  // All showcase media: cover first, then any images from the Notion page body
  const media = mini ? [mini.cover, ...(mini.gallery ?? [])].filter(Boolean) : [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;

      switch (e.key) {
        case 'Escape':
          if (escArmed) {
            router.push('/');
          } else {
            setEscArmed(true);
            clearTimeout(escTimer.current);
            escTimer.current = setTimeout(() => setEscArmed(false), 1200);
          }
          break;
        case 'ArrowRight':
          if (media.length > 1) {
            e.preventDefault();
            setHeroIndex((i) => (i + 1) % media.length);
          }
          break;
        case 'ArrowLeft':
          if (media.length > 1) {
            e.preventDefault();
            setHeroIndex((i) => (i - 1 + media.length) % media.length);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          setButtonFocus((f) => (f === null || f === 'commission' ? 'back' : 'commission'));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setButtonFocus((f) => (f === null || f === 'back' ? 'commission' : 'back'));
          break;
        case 'Enter':
          if (buttonFocus === 'back') {
            e.preventDefault();
            router.push('/all/');
          } else if (buttonFocus === 'commission') {
            e.preventDefault();
            window.open(CONTACT_URL, '_blank', 'noopener');
          }
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(escTimer.current);
    };
  }, [escArmed, router, buttonFocus, media.length]);

  if (!mini) return null;

  const tags = [
    mini.warband && { label: mini.warband },
    mini.game && { label: mini.game },
    ...mini.topics.map((x) => ({ label: x })),
    ...mini.techniques.map((x) => ({ label: x })),
  ].filter(Boolean);

  return (
    <article className="mini-detail">
      <Link href="/all/" className={buttonFocus === 'back' ? 'back-link key-focused' : 'back-link'}>
        {t('back_to_gallery')}
      </Link>
      <p className="keys-hint">{t('detail_hint')}</p>
      {escArmed && <div className="esc-toast">{t('esc_again')}</div>}

      <div className="detail-layout">
        <div className="detail-hero">
          <div className="frame detail-frame">
            <div className="frame-mat">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset(media[heroIndex] ?? null)} alt={mini.name} />
            </div>
          </div>
          {media.length > 1 && (
            <div className="media-strip">
              {media.map((src, i) => (
                <button
                  key={src}
                  className={i === heroIndex ? 'media-thumb active' : 'media-thumb'}
                  onClick={() => setHeroIndex(i)}
                  aria-label={`${mini.name} — photo ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset(src)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
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
          <a
            className={buttonFocus === 'commission' ? 'cta key-focused' : 'cta'}
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
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
