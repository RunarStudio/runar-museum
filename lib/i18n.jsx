'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const STRINGS = {
  en: {
    nav_gallery: 'Gallery',
    nav_commissions: 'Commissions',
    nav_about: 'About',
    tagline: 'Painted miniatures by Runar Studio',
    search_placeholder: 'Search minis…',
    filter_all: 'All',
    filter_warband: 'Warband',
    filter_game: 'Game',
    filter_technique: 'Technique',
    filter_topic: 'Category',
    filter_for_sale: 'For sale',
    clear_filters: 'Clear filters',
    no_results: 'No minis match those filters.',
    for_sale: 'For sale',
    sold_via: 'Interested? Get in touch:',
    commission_cta: 'Commission something like this',
    process_title: 'Painting process',
    painted_on: 'Painted',
    back_to_gallery: '← Back to gallery',
    commissions_title: 'Commissions',
    commissions_intro:
      'I take painting and printing commissions — single heroes, full warbands, busts and dioramas. Tell me what you have in mind and I will get back to you with a quote.',
    commissions_button: 'Request a commission',
    about_title: 'About Runar Studio',
    about_body:
      'Runar Studio is a one-person miniature painting and 3D printing studio. This museum collects everything painted over the years — finished pieces, work in progress, and the occasional experiment.',
    footer: 'Runar Studio — all miniatures painted by hand.',
    minis_count: 'minis',
  },
  es: {
    nav_gallery: 'Galería',
    nav_commissions: 'Comisiones',
    nav_about: 'Sobre mí',
    tagline: 'Miniaturas pintadas por Runar Studio',
    search_placeholder: 'Buscar minis…',
    filter_all: 'Todas',
    filter_warband: 'Facción',
    filter_game: 'Juego',
    filter_technique: 'Técnica',
    filter_topic: 'Categoría',
    filter_for_sale: 'En venta',
    clear_filters: 'Limpiar filtros',
    no_results: 'Ninguna mini coincide con esos filtros.',
    for_sale: 'En venta',
    sold_via: '¿Interesado? Escríbeme:',
    commission_cta: 'Encargar algo parecido',
    process_title: 'Proceso de pintado',
    painted_on: 'Pintada',
    back_to_gallery: '← Volver a la galería',
    commissions_title: 'Comisiones',
    commissions_intro:
      'Acepto encargos de pintura e impresión 3D — héroes sueltos, bandas completas, bustos y dioramas. Cuéntame qué tienes en mente y te responderé con un presupuesto.',
    commissions_button: 'Pedir una comisión',
    about_title: 'Sobre Runar Studio',
    about_body:
      'Runar Studio es un estudio unipersonal de pintura de miniaturas e impresión 3D. Este museo reúne todo lo pintado a lo largo de los años: piezas terminadas, trabajos en curso y algún que otro experimento.',
    footer: 'Runar Studio — todas las miniaturas pintadas a mano.',
    minis_count: 'minis',
  },
};

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const saved = window.localStorage.getItem('lang');
    if (saved === 'es' || saved === 'en') setLang(saved);
  }, []);

  const change = (l) => {
    setLang(l);
    window.localStorage.setItem('lang', l);
  };

  const t = (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key;

  return <LangContext.Provider value={{ lang, setLang: change, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
