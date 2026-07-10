'use client';

import { useMemo, useState } from 'react';
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

  const options = useMemo(
    () => ({
      warbands: uniq(minis.map((m) => m.warband)),
      games: uniq(minis.map((m) => m.game)),
      techniques: uniq(minis.flatMap((m) => m.techniques)),
      topics: uniq(minis.flatMap((m) => m.topics)),
    }),
    [minis]
  );

  const filtered = minis.filter((m) => {
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
  });

  const hasFilters = warband || game || technique || topic || forSaleOnly || search;
  const clearAll = () => {
    setWarband(null);
    setGame(null);
    setTechnique(null);
    setTopic(null);
    setForSaleOnly(false);
    setSearch('');
  };

  return (
    <div className="gallery-page">
      <p className="tagline">{t('tagline')}</p>

      <div className="filter-bar">
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
      </div>

      <p className="result-count">
        {filtered.length} {t('minis_count')}
      </p>

      {filtered.length === 0 ? (
        <p className="no-results">{t('no_results')}</p>
      ) : (
        <div className="grid">
          {filtered.map((m) => (
            <Link key={m.slug} href={`/minis/${m.slug}/`} className="card">
              <div className="card-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(m.thumb ?? m.cover)} alt={m.name} loading="lazy" />
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
