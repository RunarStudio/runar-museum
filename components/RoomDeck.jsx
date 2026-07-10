'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';

const SWIPE_THRESHOLD = 80;

export default function RoomDeck({ roomName, minis }) {
  const { t } = useLang();
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [mediaIdx, setMediaIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(0); // -1 exiting left, 1 exiting right
  const touchStart = useRef(null);
  const dragXRef = useRef(0); // synchronous copy — touchend can fire before React re-renders

  const n = minis.length;
  const mini = minis[idx];
  const media = mini ? [mini.cover, ...(mini.gallery ?? []), ...(mini.process ?? [])].filter(Boolean) : [];

  const advance = (dir) => {
    const next = idx + dir;
    if (next < 0 || next >= n) {
      setDragX(0);
      return;
    }
    // card slides out, then the next one animates in
    setLeaving(dir);
    setTimeout(() => {
      setIdx(next);
      setMediaIdx(0);
      setDragX(0);
      setLeaving(0);
    }, 220);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          advance(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          advance(-1);
          break;
        case 'ArrowDown':
          if (media.length > 1) {
            e.preventDefault();
            setMediaIdx((i) => (i + 1) % media.length);
          }
          break;
        case 'ArrowUp':
          if (media.length > 1) {
            e.preventDefault();
            setMediaIdx((i) => (i - 1 + media.length) % media.length);
          }
          break;
        case 'Enter':
          if (mini) {
            e.preventDefault();
            router.push(`/minis/${mini.slug}/`);
          }
          break;
        case 'Escape':
          e.preventDefault();
          router.push('/');
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, n, media.length, mini, router]);

  const onTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      dragXRef.current = dx;
      setDragX(dx);
    }
  };
  const onTouchEnd = () => {
    setDragging(false);
    touchStart.current = null;
    const dx = dragXRef.current;
    dragXRef.current = 0;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      advance(dx < 0 ? 1 : -1); // swipe left = next
    } else {
      setDragX(0);
    }
  };

  if (!mini) return null;

  const cardStyle = leaving
    ? { transform: `translateX(${leaving * -120}%) rotate(${leaving * -8}deg)`, opacity: 0 }
    : {
        transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
        transition: dragging ? 'none' : undefined,
      };

  return (
    <div className="room-deck">
      <div className="deck-topbar">
        <Link href="/" className="back-link">
          {t('back_to_entrance')}
        </Link>
        <span className="deck-plaque">{roomName}</span>
        <span className="deck-progress">
          {idx + 1} / {n}
        </span>
      </div>
      <p className="keys-hint">{t('deck_hint')}</p>
      <p className="swipe-hint">{t('swipe_hint')}</p>

      <div className="deck-stage">
        {idx > 0 && <PeekCard mini={minis[idx - 1]} side="prev" />}
        {idx < n - 1 && <PeekCard mini={minis[idx + 1]} side="next" />}

        <div
          key={mini.slug}
          className="deck-card current"
          style={cardStyle}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Link href={`/minis/${mini.slug}/`} className="deck-image-link" draggable={false}>
            <div className="frame deck-frame">
              <div className="frame-mat">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(media[mediaIdx] ?? null)} alt={mini.name} draggable={false} />
              </div>
              {mini.forSale && (
                <span className="badge">
                  {t('for_sale')}
                  {mini.price != null ? ` · ${mini.price}€` : ''}
                </span>
              )}
            </div>
          </Link>

          {media.length > 1 && (
            <div className="dots">
              {media.map((src, i) => (
                <button
                  key={src}
                  className={i === mediaIdx ? 'dot active' : 'dot'}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => setMediaIdx(i)}
                />
              ))}
            </div>
          )}

          <div className="deck-info">
            <h1>{mini.name}</h1>
            <p className="deck-tags">{[mini.warband, mini.game].filter(Boolean).join(' · ')}</p>
            <Link href={`/minis/${mini.slug}/`} className="cta deck-cta">
              {t('view_details')} →
            </Link>
          </div>
        </div>
      </div>

      {/* Preload neighbors so swiping never shows a blank frame */}
      <div className="preload" aria-hidden="true">
        {[minis[idx - 1], minis[idx + 1]]
          .filter(Boolean)
          .map((m) =>
            // eslint-disable-next-line @next/next/no-img-element
            m.cover ? <img key={m.slug} src={asset(m.cover)} alt="" /> : null
          )}
      </div>
    </div>
  );
}

function PeekCard({ mini, side }) {
  return (
    <div className={`deck-card peek ${side}`} aria-hidden="true">
      <div className="frame deck-frame">
        <div className="frame-mat">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset(mini.thumb ?? mini.cover)} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
