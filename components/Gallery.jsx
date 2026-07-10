'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export default function Gallery({ minis }) {
  const { t } = useLang();
  const [search, setSearch] = useState('');
  const [warband, setWarband] = useState(null);
  const [game, setGame] = useState(null);
  const [technique, setTechnique] = useState(null);
  const [topic, setTopic] = useState(null);
  const [forSaleOnly, setForSaleOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keyboard navigation + lightbox
  const [selected, setSelected] = useState(-1);
  const [lightbox, setLightbox] = useState(-1); // index into filtered, -1 = closed
  const gridRef = useRef(null);

  const options = useMemo(
    () => ({
      warbands: uniq(minis.map((m) => m.warband)),
      games: uniq(minis.map((m) => m.game)),
      techniques: uniq(minis.flatMap((m) => m.techniques)),
      topics: uniq(minis.flatMap((m) => m.topics)),
    }),
    [minis]
  );

  const filtered = useMemo(
    () =>
      minis.filter((m) => {
        if (warband && m.warband !== warband) return false;
        if (game && m.game !== game) return false;
        if (technique && !m.techniques.includes(technique)) return false;
        if (topic && !m.topics.includes(topic)) return false;
        if (forSaleOnly && !m.forSale) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = [m.name, m.warband, m.game, m.notes, ...m.topics, ...m.techniques]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [minis, warband, game, technique, topic, forSaleOnly, search]
  );

  // Keep selection valid when filters change
  useEffect(() => {
    setSelected((s) => (s >= filtered.length ? filtered.length - 1 : s));
    setLightbox((l) => (l >= filtered.length ? -1 : l));
  }, [filtered.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;

      if (lightbox >= 0) {
        if (e.key === 'Escape' || e.key === ' ') {
          e.preventDefault();
          setLightbox(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setLightbox((l) => Math.min(l + 1, filtered.length - 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setLightbox((l) => Math.max(l - 1, 0));
        }
        return;
      }

      // Columns currently rendered, derived from the live grid layout
      const cols = (() => {
        const kids = gridRef.current?.children;
        if (!kids || kids.length === 0) return 1;
        const top = kids[0].offsetTop;
        let n = 0;
        while (n < kids.length && kids[n].offsetTop === top) n++;
        return Math.max(n, 1);
      })();

      const move = (delta) => {
        e.preventDefault();
        setSelected((s) => {
          const next = s < 0 ? 0 : Math.min(Math.max(s + delta, 0), filtered.length - 1);
          gridRef.current?.children[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
      };

      switch (e.key) {
        case 'ArrowRight':
          move(1);
          break;
        case 'ArrowLeft':
          move(-1);
          break;
        case 'ArrowDown':
          move(cols);
          break;
        case 'ArrowUp':
          move(-cols);
          break;
        case 'Enter':
          if (selected >= 0 && filtered[selected]) {
            e.preventDefault();
            setLightbox(selected);
          }
          break;
        case 'Escape':
          setDrawerOpen(false);
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, selected, filtered]);

  const hasFilters = warband || game || technique || topic || forSaleOnly || search;
  const activeFilterCount =
    [warband, game, technique, topic].filter(Boolean).length + (forSaleOnly ? 1 : 0);
  const clearAll = () => {
    setWarband(null);
    setGame(null);
    setTechnique(null);
    setTopic(null);
    setForSaleOnly(false);
    setSearch('');
  };

  const filterControls = (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('search_placeholder')}
        aria-label={t('search_placeholder')}
      />
      <FilterGroup label={t('filter_warband')} options={options.warbands} value={warband} onChange={setWarband} allLabel={t('filter_all')} />
      <FilterGroup label={t('filter_game')} options={options.games} value={game} onChange={setGame} allLabel={t('filter_all')} />
      <FilterGroup label={t('filter_technique')} options={options.techniques} value={technique} onChange={setTechnique} allLabel={t('filter_all')} />
      <FilterGroup label={t('filter_topic')} options={options.topics} value={topic} onChange={setTopic} allLabel={t('filter_all')} />
      <label className="for-sale-toggle">
        <input type="checkbox" checked={forSaleOnly} onChange={(e) => setForSaleOnly(e.target.checked)} />
        {t('filter_for_sale')}
      </label>
      {hasFilters && (
        <button className="clear-filters" onClick={clearAll}>
          {t('clear_filters')}
        </button>
      )}
    </>
  );

  return (
    <div className="gallery-page">
      <p className="tagline">{t('tagline')}</p>
      <p className="keys-hint">{t('keys_hint')}</p>

      {/* Inline filters — mobile / narrow screens */}
      <div className="filter-bar filter-inline">{filterControls}</div>

      {/* Floating filter orb + drawer — desktop */}
      <button
        className={drawerOpen ? 'filter-orb open' : 'filter-orb'}
        onClick={() => setDrawerOpen((o) => !o)}
        aria-label={t('filters')}
        title={t('filters')}
      >
        <span className="orb-icon">🌐</span>
        {activeFilterCount > 0 && <span className="orb-count">{activeFilterCount}</span>}
      </button>
      <aside className={drawerOpen ? 'filter-drawer open' : 'filter-drawer'} aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <h2>{t('filters')}</h2>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t('close')}>
            ✕
          </button>
        </div>
        <div className="filter-bar">{filterControls}</div>
      </aside>

      <p className="result-count">
        {filtered.length} {t('minis_count')}
      </p>

      {filtered.length === 0 ? (
        <p className="no-results">{t('no_results')}</p>
      ) : (
        <div className="grid" ref={gridRef}>
          {filtered.map((m, i) => (
            <Link
              key={m.slug}
              href={`/minis/${m.slug}/`}
              className={i === selected ? 'card selected' : 'card'}
              onMouseEnter={() => setSelected(i)}
            >
              <div className="frame">
                <div className="frame-mat">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset(m.thumb ?? m.cover)} alt={m.name} loading="lazy" />
                </div>
                {m.forSale && (
                  <span className="badge">
                    {t('for_sale')}
                    {m.price != null ? ` · ${m.price}€` : ''}
                  </span>
                )}
              </div>
              <div className="card-body">
                <h3>{m.name}</h3>
                <p>{[m.warband, m.game].filter(Boolean).join(' · ')}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {lightbox >= 0 && filtered[lightbox] && (
        <Lightbox
          mini={filtered[lightbox]}
          onClose={() => setLightbox(-1)}
          onPrev={() => setLightbox((l) => Math.max(l - 1, 0))}
          onNext={() => setLightbox((l) => Math.min(l + 1, filtered.length - 1))}
          hasPrev={lightbox > 0}
          hasNext={lightbox < filtered.length - 1}
        />
      )}
    </div>
  );
}

function Lightbox({ mini, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const { t } = useLang();
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={mini.name} onClick={onClose}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="frame lightbox-frame">
          <div className="frame-mat">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset(mini.cover)} alt={mini.name} />
          </div>
        </div>
        <div className="lightbox-caption">
          <span>{mini.name}</span>
          <Link href={`/minis/${mini.slug}/`}>{t('view_details')} →</Link>
        </div>
      </div>
      {hasPrev && (
        <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Previous">
          ‹
        </button>
      )}
      {hasNext && (
        <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Next">
          ›
        </button>
      )}
      <button className="lightbox-close" onClick={onClose} aria-label={t('close')}>
        ✕
      </button>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange, allLabel }) {
  if (options.length === 0) return null;
  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="chips">
        <button className={value === null ? 'chip active' : 'chip'} onClick={() => onChange(null)}>
          {allLabel}
        </button>
        {options.map((opt) => (
          <button
            key={opt}
            className={value === opt ? 'chip active' : 'chip'}
            onClick={() => onChange(value === opt ? null : opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
