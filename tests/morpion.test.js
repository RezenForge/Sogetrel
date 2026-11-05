/**
 * morpion.test.js — l'IA du morpion ne perd jamais.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { gagnant, coupIA, coupPartie } from '../js/jarvis/morpion.js';

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
  test('en partie : parfois un coup au hasard (battable), toujours sur une case libre', () => {
    const p = ['X', null, null, null, 'O', null, null, null, 'X'];
    const coups = new Set(Array.from({ length: 200 }, () => coupPartie(p)));
    vrai(coups.size > 1 && [...coups].every(i => !p[i]));
  });
  test('commande cachée : absente de l\'autocomplétion', async () => {
    const { proposer } = await import('../js/jarvis/completion.js');
    const r = proposer('mor', 3, { dossiers: [], aujourdhui: '2026-11-05' });
    vrai(!JSON.stringify(r).includes('morpion'));
  });
});
