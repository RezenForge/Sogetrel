/**
 * morpion.test.js — l'IA du morpion ne perd jamais.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { gagnant, coupIA } from '../js/jarvis/morpion.js';

groupe('Morpion', () => {
  test('gagnant : ligne, colonne, diagonale, nul', () => egal(
    [gagnant(['X', 'X', 'X', null, 'O', 'O', null, null, null]), gagnant(['O', 'X', null, 'O', 'X', null, 'O', null, null]), gagnant(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), gagnant(Array(9).fill(null))],
    ['X', 'O', 'nul', null]));
  test('l\'IA gagne quand elle peut, bloque sinon', () => egal(
    [coupIA(['O', 'O', null, 'X', 'X', null, 'X', null, null]), coupIA(['X', 'X', null, null, 'O', null, null, null, null])], [2, 2]));
  test('l\'IA ne perd jamais (toutes les parties possibles, X commence)', () => {
    let perdues = 0;
    const explorer = p => {
      const g = gagnant(p);
      if (g) { if (g === 'X') perdues++; return; }
      for (let i = 0; i < 9; i++) {
        if (p[i]) continue;
        const q = [...p]; q[i] = 'X';
        if (gagnant(q)) { if (gagnant(q) === 'X') perdues++; continue; }
        q[coupIA(q, 'O')] = 'O';
        explorer(q);
      }
    };
    explorer(Array(9).fill(null));
    egal(perdues, 0);
  });
});
