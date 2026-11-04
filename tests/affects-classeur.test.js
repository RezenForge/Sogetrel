/**
 * affects-classeur.test.js — écarts entre l'affect du registre et la colonne I du classeur partagé.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { ecartAffect } from '../js/affects-classeur.js';
import { extraireDossiers } from '../js/import-excel.js';
import { lireCsvClasseur } from '../js/export-excel.js';
import { dessinerTableauBord, LARGEUR } from '../js/jarvis/tableau-bord.js';

const D = (type) => ({ gcblo: 'SBA501404-THF010', type });

groupe('Écarts d\'affect avec la colonne I', () => {
  test('même affect (écritures tolérées) : pas d\'écart', () => egal([ecartAffect(D('NUM21'), { 'SBA501404-THF010': ['num 21'] }), ecartAffect(D('AIR'), { 'SBA501404-THF010': ['Air'] })], [null, null]));
  test('affect différent : écart, avec ce que dit la colonne I', () => egal(ecartAffect(D('AIR'), { 'SBA501404-THF010': ['NUM21'] }), { classeur: ['NUM21'] }));
  test('registre sans affect, colonne I lisible : écart', () => vrai(!!ecartAffect(D(null), { 'SBA501404-THF010': ['AIR'] })));
  test('colonne I vide ou absente : pas d\'écart', () => egal([ecartAffect(D('AIR'), {}), ecartAffect(D('AIR'), { 'SBA501404-THF010': [] })], [null, null]));
  test('autre entreprise : pas d\'écart si le registre est sans affect, écart sinon', () =>
    egal([ecartAffect(D(null), { 'SBA501404-THF010': ['SPIE'] }), ecartAffect(D('AIR'), { 'SBA501404-THF010': ['SPIE'] })], [null, { classeur: ['SPIE'] }]));
  test('plusieurs lignes qui ne disent pas la même chose : écart', () => vrai(!!ecartAffect(D('AIR'), { 'SBA501404-THF010': ['AIR', 'NUM21'] })));
  test('l\'import retient toutes les valeurs de la colonne I', () => {
    const csv = 'ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J\n33;2;SBA501404-THF010;GCBLO;AIR;;;\n16;5;SBA501404-THF010;GCBLO;NUM21;;;\n17;3;LRO500767-THF010;GCBLO;;;;';
    egal(extraireDossiers(lireCsvClasseur(csv), []).affects, { 'SBA501404-THF010': ['AIR', 'NUM21'], 'LRO500767-THF010': [] });
  });
  test('tableau de bord : « ≠ colonne I » cliquable, largeur tenue', () => {
    const s = { total: 2, parType: { NUM21: 1, AIR: 1, SOGETREL: 0, SANS: 0 }, parStatut: { A_FAIRE: 2, EN_VALIDATION: 0, MAD: 0, REFUSE: 0, LITIGE: 0, ANNULE: 0, ATTACH: 0 }, valo: { total: 0, parStatut: {}, sans: 2 } };
    const b = dessinerTableauBord(s, '2026-11-04', { ecartsAffect: 3 });
    vrai(b.texte.some(l => l.includes('≠ colonne I') && l.includes('3')) && b.texte.every(l => [...l].length === LARGEUR) && b.html.includes('data-commande="ls ecart-affect"'));
  });
});
