'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';

export default function Entrance({ entranceMinis, rooms }) {
  const { t } = useLang();
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [zone, setZone] = useState('showcase'); // 'showcase' | 'doors'
  const [doorIdx, setDoorIdx] = useState(0);
  const [slideDir, setSlideDir] = useState(0); // -1 left, 1 right — drives the slide animation
  const touchStart = useRef(null);

  const n = entranceMinis.length;
  const current = entranceMinis[idx];

  const cycle = (dir) => {
    if (n < 2) return;
    setSlideDir(dir);
    setIdx((i) => (i + dir + n) % n);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;

      if (zoomed) {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setZoomed(false);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          cycle(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          cycle(-1);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (zone === 'showcase') cycle(1);
          else setDoorIdx((i) => Math.min(i + 1, rooms.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (zone === 'showcase') cycle(-1);
          else setDoorIdx((i) => Math.max(i - 1, 0));
          break;
        case 'ArrowDown':
          if (rooms.length > 0) {
            e.preventDefault();
            setZone('doors');
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setZone('showcase');
          break;
        case 'Enter':
          e.preventDefault();
          if (zone === 'showcase') setZoomed(true);
          else if (rooms[doorIdx]) router.push(`/rooms/${rooms[doorIdx].slug}/`);
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed, zone, doorIdx, rooms, n, router]);

  const onTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStart.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) > 50) cycle(delta < 0 ? 1 : -1);
  };

  return (
    <div className="entrance-page">
      <section className="showcase spotlight">
        <p className="section-label">{t('tagline')}</p>
        <p className="keys-hint">{t('entrance_hint')}</p>

        <div
          className={zone === 'showcase' ? 'showcase-stage zone-active' : 'showcase-stage'}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={() => setZoomed(true)}
          role="button"
          tabIndex={0}
          aria-label={current?.name}
        >
          {current && (
            <div
              key={current.slug}
              className={slideDir >= 0 ? 'frame showcase-frame slide-left' : 'frame showcase-frame slide-right'}
            >
              <div className="frame-mat">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(current.cover)} alt={current.name} />
              </div>
            </div>
          )}
          {n > 1 && (
            <>
              <button
                className="showcase-nav prev"
                aria-label="Previous"
                onClick={(e) => {
                  e.stopPropagation();
                  cycle(-1);
                }}
              >
                ‹
              </button>
              <button
                className="showcase-nav next"
                aria-label="Next"
                onClick={(e) => {
                  e.stopPropagation();
                  cycle(1);
                }}
              >
                ›
              </button>
            </>
          )}
        </div>

        <p className="showcase-caption">{current?.name}</p>
        {n > 1 && (
          <div className="dots">
            {entranceMinis.map((m, i) => (
              <button
                key={m.slug}
                className={i === idx ? 'dot active' : 'dot'}
                aria-label={m.name}
                onClick={() => {
                  setSlideDir(i > idx ? 1 : -1);
                  setIdx(i);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {rooms.length > 0 && (
        <section className="rooms-section">
          <h2 className="section-label rooms-title">{t('rooms_label')}</h2>
          <div className="doors-row">
            {rooms.map((room, i) => (
              <Link
                key={room.slug}
                href={`/rooms/${room.slug}/`}
                className={zone === 'doors' && i === doorIdx ? 'room-door selected' : 'room-door'}
                onMouseEnter={() => {
                  setZone('doors');
                  setDoorIdx(i);
                }}
              >
                <div className="door-frame">
                  <div className="door-mat">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset(room.previewImage)} alt={room.name} loading="lazy" />
                  </div>
                </div>
                <span className="door-plaque">
                  {room.name}
                  <span className="door-count">
                    {room.count} {room.count === 1 ? t('piece') : t('pieces')}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="view-all-line">
            <Link href="/all/">{t('view_all')} →</Link>
          </p>
        </section>
      )}

      {zoomed && current && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoomed(false)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="frame lightbox-frame">
              <div className="frame-mat">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(current.cover)} alt={current.name} />
              </div>
            </div>
            <div className="lightbox-caption">
              <span>{current.name}</span>
              <Link href={`/minis/${current.slug}/`}>{t('view_details')} →</Link>
            </div>
          </div>
          <button className="lightbox-close" onClick={() => setZoomed(false)} aria-label={t('close')}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
