/**
 * dame.test.js — règles du jeu de dames (commande cachée).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { positionDepart, coupsLegaux, jouerCoup, coupIA } from '../js/jarvis/dame.js';

const vide = () => Array(100).fill(null);
const i = (r, c) => r * 10 + c;

groupe('Dames', () => {
  test('départ : 20 pions chacun, 9 coups possibles pour les blancs', () => {
    const p = positionDepart();
    egal([p.filter(x => x === 'b').length, p.filter(x => x === 'n').length, coupsLegaux(p, 'b').length], [20, 20, 9]);
  });
  test('prise obligatoire', () => {
    const p = vide(); p[i(6, 3)] = 'b'; p[i(5, 4)] = 'n'; p[i(9, 0)] = 'b';
    const c = coupsLegaux(p, 'b');
    egal(c.map(m => [m.de, m.vers, m.prises]), [[i(6, 3), i(4, 5), [i(5, 4)]]]);
  });
  test('un pion prend aussi en arrière', () => {
    const p = vide(); p[i(4, 3)] = 'b'; p[i(5, 4)] = 'n';
    egal(coupsLegaux(p, 'b').map(m => m.vers), [i(6, 5)]);
  });
  test('prise majoritaire : la rafle la plus longue est imposée', () => {
    const p = vide(); p[i(6, 3)] = 'b'; p[i(5, 2)] = 'n'; p[i(5, 4)] = 'n'; p[i(3, 4)] = 'n';
    const c = coupsLegaux(p, 'b');
    egal(c.map(m => m.prises.length), [2]);
    egal(c[0].vers, i(2, 3));
  });
  test('dame volante : prend à distance et se pose où elle veut derrière', () => {
    const p = vide(); p[i(9, 0)] = 'B'; p[i(5, 4)] = 'n';
    const c = coupsLegaux(p, 'b');
    egal(c.map(m => m.vers).sort((a, b) => a - b), [i(0, 9), i(1, 8), i(2, 7), i(3, 6), i(4, 5)].sort((a, b) => a - b));
  });
  test('promotion en fin de coup', () => {
    const p = vide(); p[i(1, 2)] = 'b';
    egal(jouerCoup(p, coupsLegaux(p, 'b')[0])[i(0, 1)] ?? jouerCoup(p, coupsLegaux(p, 'b')[0])[i(0, 3)], 'B');
  });
  test('l\'IA joue un coup légal et prend quand elle doit', () => {
    const p = vide(); p[i(3, 4)] = 'n'; p[i(4, 5)] = 'b'; p[i(9, 0)] = 'b';
    const m = coupIA(p, 'n', { hasard: () => 0.99 });
    egal(m.prises, [i(4, 5)]);
    vrai(coupsLegaux(positionDepart(), 'n').length > 0);
  });
});
