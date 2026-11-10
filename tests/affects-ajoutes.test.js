/**
 * affects-ajoutes.test.js — R23 : « add ‹AFFECT› ».
 */
import { groupe, test, egal, vrai } from './outil.js';
import { nouvelAffect } from '../js/affects-ajoutes.js';

groupe('R23 — Nouvel affect', () => {
  test('ELIOS : code, libellé, mot', () => {
    egal(nouvelAffect('ELIOS', [], ['NUM21']).affect, { code: 'ELIOS', libelle: 'ELIOS', mot: 'elios' });
    egal(nouvelAffect('Réseaux-33', [], []).affect, { code: 'RESEAUX_33', libelle: 'Réseaux-33', mot: 'reseaux-33' });
  });
  test('refusés : vide, plusieurs mots, déjà là, mot réservé', () => {
    vrai(!nouvelAffect('', [], []).ok);
    vrai(!nouvelAffect('deux mots', [], []).ok);
    vrai(!nouvelAffect('air', ['air'], ['AIR']).ok);
    vrai(!nouvelAffect('retard', ['retard'], []).ok);
    vrai(!nouvelAffect('1abc', [], []).ok);
  });
});
