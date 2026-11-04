/**
 * info.test.js — retrouver des dossiers à partir d'une liste collée.
 */
import { groupe, test, egal } from './outil.js';
import { chercherListe } from '../js/info.js';

const D = ['SBA501404-THF010', 'SBA501423-THF010', 'LRO500767-THF010', 'LRO500768-THF010', 'SBA501023-ACF011', 'POI500553-THF011', 'POI500553-ACF010'].map((gcblo, i) => ({ id: String(i), gcblo }));
const noms = r => r.trouves.map(d => d.gcblo);

groupe('info — liste collée', () => {
  test('colonne Excel : dans l\'ordre collé, sans doublon', () => {
    const r = chercherListe('LRO500767-THF010 SBA501404-THF010 LRO500767-THF010', D);
    egal(noms(r), ['LRO500767-THF010', 'SBA501404-THF010']);
  });
  test('écritures tolérées : minuscules, sans tiret, espaces autour du tiret', () =>
    egal(noms(chercherListe('sba501404thf010 SBA501423 - THF010', D)), ['SBA501404-THF010', 'SBA501423-THF010']));
  test('introuvables listés à part', () => {
    const r = chercherListe('SBA501404-THF010 ABC123456-DEF789', D);
    egal([noms(r), r.introuvables], [['SBA501404-THF010'], ['ABC123456-DEF789']]);
  });
  test('morceau de numéro : retenu seulement s\'il désigne un seul dossier', () => {
    const r = chercherListe('501423 5007', D);
    egal([noms(r), r.ambigus], [['SBA501423-THF010'], ['5007']]);
  });
  test('en-tête et texte ignorés', () => {
    const r = chercherListe('GCBLO SBA501404-THF010 dossier', D);
    egal([noms(r), r.ignores], [['SBA501404-THF010'], 2]);
  });
  test('colonne recollée bout à bout par le navigateur', () =>
    egal(noms(chercherListe('SBA501404-THF010SBA501423-THF010LRO500767-THF010', D)), ['SBA501404-THF010', 'SBA501423-THF010', 'LRO500767-THF010']));
  test('tiret long ou insécable (copié de Word, d\'un mail)', () => egal(noms(chercherListe('SBA501404–THF010 SBA501423‑THF010 LRO-500767-THF010', D)).length, 3));
  test('GCBLO entouré de texte (« Dossier SBA501404-THF010 : ok »)', () => egal(noms(chercherListe('Dossier SBA501404-THF010 : ok', D)), ['SBA501404-THF010']));
  test('début de GCBLO seul (« SBA501023 ») → le dossier complet', () =>
    egal(noms(chercherListe('SBA501023\nSBA501404\nsba 501423', D)), ['SBA501023-ACF011', 'SBA501404-THF010', 'SBA501423-THF010']));
  test('début de GCBLO partagé par deux dossiers → les deux', () => egal(noms(chercherListe('POI500553', D)), ['POI500553-THF011', 'POI500553-ACF010']));
  test('début de GCBLO absent de la base → introuvable', () => egal(chercherListe('ABC123456', D).introuvables, ['ABC123456']));
  test('débuts recollés bout à bout', () => egal(noms(chercherListe('SBA501023SBA501404', D)).length, 2));
  test('séparateurs : virgules, points-virgules, tabulations', () => egal(noms(chercherListe('SBA501404-THF010;SBA501423-THF010,\tLRO500768-THF010', D)).length, 3));
});

import { resultatLs, criteresListe, analyser } from '../js/jarvis/analyse.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';

groupe('ls — colonne de GCBLO collée (ex-« info »)', () => {
  const regles = creerDossiers(creerStore(supportMemoire()));
  regles.creer({ type: 'AIR', gcblo: 'SBA501404-THF010' });
  regles.creer({ type: 'NUM21', gcblo: 'LRO500767-THF010' });
  const att = regles.creer({ type: 'AIR', gcblo: 'SBA501023-ACF011' }).dossier;
  regles.modifier(att.id, { statutDft: 'ATTACH' });
  const ls = texte => {
    const dossiers = regles.filtrer({});
    const a = analyser(texte, texte.length, { dossiers, aujourdhui: '2026-11-04', regles });
    return resultatLs(criteresListe(a.valeurs), regles, dossiers);
  };
  test('deux GCBLO ou plus : liste collée, ordre collé, Attach compris, introuvables', () => {
    const r = ls('ls GCBLO LRO500767-THF010 SBA501023 ABC123456-DEF789');
    egal([r.liste.map(d => d.gcblo), r.collee.introuvables], [['LRO500767-THF010', 'SBA501023-ACF011'], ['ABC123456-DEF789']]);
    egal(ls('ls SBA501023 LRO500767-THF010').liste.map(d => d.gcblo), ['SBA501023-ACF011', 'LRO500767-THF010']);   // début et GCBLO complet mélangés : ordre collé
  });
  test('avec un filtre en plus (affect)', () => egal(ls('ls air LRO500767-THF010 SBA501404-THF010').liste.map(d => d.gcblo), ['SBA501404-THF010']));
  test('un seul GCBLO : ls habituel', () => { const r = ls('ls SBA501404'); egal([r.collee, r.liste.length], [null, 1]); });
  test('la commande info n\'existe plus', () => egal(analyser('info SBA501404', 15, { dossiers: [], aujourdhui: '2026-11-04', regles }).commande, null));
});

groupe('ls — tri (tri:colonne, clic sur l\'en-tête)', () => {
  const regles = creerDossiers(creerStore(supportMemoire()));
  regles.creer({ type: 'AIR', gcblo: 'SBA501404-THF010', valorisation: 60, commune: 'Bègles' });
  regles.creer({ type: 'NUM21', gcblo: 'LRO500767-THF010', valorisation: 30, commune: 'Royan' });
  regles.creer({ type: 'AIR', gcblo: 'POI500001-THF010', commune: 'Niort' });
  const ls = texte => { const dossiers = regles.filtrer({}); return resultatLs(criteresListe(analyser(texte, texte.length, { dossiers, aujourdhui: '2026-11-04', regles }).valeurs), regles, dossiers).liste.map(d => d.gcblo.slice(0, 3)); };
  test('croissant, sans valeur à la fin', () => egal(ls('ls tri:valo'), ['LRO', 'SBA', 'POI']));
  test('décroissant avec « - »', () => egal(ls('ls tri:valo-'), ['SBA', 'LRO', 'POI']));
  test('avec un filtre, par commune', () => egal(ls('ls air tri:commune'), ['SBA', 'POI']));
});

groupe('ls — dossiers Attach et Annulé masqués', () => {
  const regles = creerDossiers(creerStore(supportMemoire()));
  regles.creer({ type: 'AIR', gcblo: 'SBA501404-THF010' });
  for (const [g, st] of [['LRO500767-THF010', 'ANNULE'], ['POI500001-THF010', 'ATTACH']]) regles.modifier(regles.creer({ type: 'AIR', gcblo: g }).dossier.id, { statutDft: st });
  const ls = texte => { const dossiers = regles.filtrer({}); return resultatLs(criteresListe(analyser(texte, texte.length, { dossiers, aujourdhui: '2026-11-04', regles }).valeurs), regles, dossiers).liste.map(d => d.gcblo.slice(0, 3)); };
  test('ls : ni annulés ni attach', () => egal(ls('ls'), ['SBA']));
  test('ls annule : les annulés', () => egal(ls('ls annule'), ['LRO']));
  test('ls air annule attach : les deux', () => egal(ls('ls air annule attach').sort(), ['LRO', 'POI']));
});
