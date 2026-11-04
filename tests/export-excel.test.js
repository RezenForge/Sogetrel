/**
 * export-excel.test.js — R14 : le CSV lu par la macro du classeur partagé.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { csvRegistre } from '../js/export-excel.js';

const D = (o = {}) => ({ gcblo: 'SBA501404-THF010', type: 'NUM21', statutDft: 'ATTACH', fci: ['F26154200726', 'F11111111111'], commune: 'Le Haillan; Est', valorisation: 31.5, dateAffectation: '2026-11-04', modifieLe: null, ...o });

groupe('R14 — CSV du registre', () => {
  const csv = csvRegistre([D(), D({ gcblo: 'LRO500767-THF010', type: null, statutDft: 'A_FAIRE', fci: [], valorisation: null, dateAffectation: null })]);
  const lignes = csv.replace('﻿', '').trim().split('\r\n');
  test('UTF-8 avec BOM, séparateur « ; », en-têtes', () => { vrai(csv.startsWith('﻿')); egal(lignes[0], 'GCBLO;AFFECT;STATUT DFT;CODE STATUT;FCI;COMMUNE;VALO;DATE;MODIFIE LE'); });
  test('triées par GCBLO, valeurs lisibles', () => egal(lignes.slice(1), [
    'LRO500767-THF010;;À faire;A_FAIRE;;Le Haillan Est;;;',
    'SBA501404-THF010;NUM21;Attach;ATTACH;F26154200726 F11111111111;Le Haillan Est;31,5;04/11/2026;']));
  test('aucun « ; » ni retour à la ligne parasite', () => vrai(lignes.every(l => l.split(';').length === 9)));
});

import { lireCsvClasseur } from '../js/export-excel.js';
import { extraireDossiers } from '../js/import-excel.js';

groupe('R14 — classeur-gcblo.csv (écrit par la macro)', () => {
  const csv = '﻿ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J\r\n' +
    '33;12;SBA501404-THF010;GCBLO;NUM21;Le Haillan;31,5;Numéro de commande FCI : F26154200726\r\n' +
    '16;4;LRO500767-THF010;GCBLO;;Royan;;\r\n' +
    '17;9;POI500001-THF010;FACTU;AIR;Niort;60;\r\n';
  const classeur = lireCsvClasseur(csv);
  test('un classeur au format de lireClasseur, rangé par onglet', () => {
    egal(Object.keys(classeur.feuilles).sort(), ['16', '17', '33']);
    egal(classeur.feuilles['33'][0], { numero: 12, cellules: { D: 'SBA501404-THF010', E: 'GCBLO', I: 'NUM21', G: 'Le Haillan', H: '31,5', J: 'Numéro de commande FCI : F26154200726' } });
  });
  test('traité comme un import Excel : seules les lignes GCBLO, FCI lu après la mention', () => {
    const r = extraireDossiers(classeur, []);
    egal(r.nouveaux.map(n => [n.gcblo, n.type, n.fci, n.commune, n.valorisation]), [
      ['SBA501404-THF010', 'NUM21', ['F26154200726'], 'Le Haillan', 31.5],
      ['LRO500767-THF010', null, [], 'Royan', null]]);
  });
  test('en-têtes manquants : refusé', () => {
    let msg = ''; try { lireCsvClasseur('A;B\r\n1;2'); } catch (e) { msg = e.message; }
    vrai(msg.includes('en-têtes'));
  });
});
