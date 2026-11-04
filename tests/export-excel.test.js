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
