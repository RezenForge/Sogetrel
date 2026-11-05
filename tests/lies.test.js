/**
 * lies.test.js — dossiers liés (même affaire dans le classeur partagé, autre suffixe).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { extraireLies, liesDe, totalLies, chaleurs, chaleur, prefixe } from '../js/dossiers-lies.js';
import { lireCsvClasseur } from '../js/export-excel.js';

const CSV = ['ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J',
  '33;2;SBA301460-THF010;GCBLO;NUM21;Mérignac;60;Numéro de commande FCI : F26154200726',
  '33;3;SBA301460-ACD010;EN COURS;SOGETREL;Mérignac;18 400;Attente PV',
  '33;4;SBA301460-ACD011;A FAIRE;AIR;Mérignac;3250,5;',
  '16;5;SBA301460-ACD010;EN COURS;SOGETREL;Mérignac;100;doublon sur un autre onglet',
  '16;6;ANG400000-ACD010;EN COURS;AIR;Cognac;99999;sans GCBLO',
  '16;7;LRO500767-THF011;GCBLO;AIR;Royan;30;'].join('\n');

groupe('Dossiers liés', () => {
  const lies = extraireLies(lireCsvClasseur(CSV), ['SBA301460-THF010', 'LRO500767-THF011']);
  test('préfixe d\'affaire', () => egal([prefixe('SBA301460-ACD010'), prefixe('sba 301460-thf010'), prefixe('xx')], ['SBA301460', 'SBA301460', '']));
  test('les lignes de la même affaire, sauf les GCBLO ; une affaire sans GCBLO est ignorée', () => {
    egal(Object.keys(lies), ['SBA301460']);
    egal(lies.SBA301460.map(l => [l.dossier, l.statut, l.affect, l.valo, l.commentaire]), [
      ['SBA301460-ACD010', 'EN COURS', 'SOGETREL', 18400, 'Attente PV'], ['SBA301460-ACD011', 'A FAIRE', 'AIR', 3250.5, '']]);   // le doublon (autre onglet) n'est compté qu'une fois
  });
  test('triés par valo, total', () => {
    const d = { gcblo: 'SBA301460-THF010' };
    egal([liesDe(d, lies).map(l => l.valo), totalLies(d, lies), totalLies({ gcblo: 'LRO500767-THF011' }, lies)], [[18400, 3250.5], 21650.5, null]);
  });
  test('couleur selon l\'enjeu, relative au registre', () => {
    const ds = Array.from({ length: 10 }, (_, i) => ({ gcblo: `SBA30146${i}-THF010` }));
    const l = Object.fromEntries(ds.map((d, i) => [`SBA30146${i}`, [{ valo: (i + 1) * 1000 }]]));
    const s = chaleurs(ds, l);
    egal([chaleur(10000, s), chaleur(8000, s), chaleur(2000, s), chaleur(null, s)], ['lie-fort', 'lie-moyen', 'lie-faible', '']);
  });
});
