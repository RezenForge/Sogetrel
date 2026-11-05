/**
 * mails-recus.test.js — R18 : FCI reçus par mail (mails-gcblo.csv écrit par la macro Outlook).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { lireCsvMailsRecus, trierMailsRecus } from '../js/mails-recus.js';

const CSV = '﻿GCBLO;FCI;RECU LE;DE;OBJET\r\n'
  + 'SBA300497-THF010;F12345678901;05/11/2026 09:12;EL MAHDAOUI Omar;RE: GCBLO | SBA300497-THF010 | NUM21\r\n'
  + 'BOR300498-THF010;F11111111111 f22222222222 F123;05/11/2026 10:00;SANNIER Jérémie;RE: GCBLO | BOR300498-THF010 | AIR\r\n'
  + 'LRO300499-THF010;pas de fci;05/11/2026;X;Y\r\n';

groupe('R18 — Lecture de mails-gcblo.csv', () => {
  test('une ligne par mail avec FCI valide, FCI en majuscules, invalides ignorés', () => {
    const l = lireCsvMailsRecus(CSV);
    egal(l.map(x => [x.gcblo, x.fci]), [['SBA300497-THF010', ['F12345678901']], ['BOR300498-THF010', ['F11111111111', 'F22222222222']]]);
    egal([l[0].de, l[0].recuLe], ['EL MAHDAOUI Omar', '05/11/2026 09:12']);
  });
  test('vide ou sans en-têtes : rien', () => { egal(lireCsvMailsRecus(''), []); egal(lireCsvMailsRecus('A;B\r\n1;2'), []); });
});

groupe('R18 — Que faire de chaque mail', () => {
  const d = (gcblo, fci = []) => ({ id: gcblo, gcblo, fci });
  const l = (gcblo, fci) => ({ gcblo, fci, de: 'X', recuLe: '', objet: '' });
  test('dossier sans FCI : appliqué', () => {
    const r = trierMailsRecus([d('A')], [l('A', ['F12345678901'])]);
    egal(r.appliquer.map(a => [a.dossier.gcblo, a.fci]), [['A', ['F12345678901']]]);
  });
  test('FCI déjà connu : rien (mail relu chaque minute)', () => {
    const r = trierMailsRecus([d('A', ['F12345678901'])], [l('A', ['F12345678901'])]);
    egal([r.appliquer.length, r.differents.length, r.inconnus.length], [0, 0, 0]);
  });
  test('autre FCI déjà connu : signalé, pas appliqué', () => {
    const r = trierMailsRecus([d('A', ['F99999999999'])], [l('A', ['F12345678901'])]);
    egal([r.appliquer.length, r.differents.length], [0, 1]);
  });
  test('GCBLO absent : signalé une fois', () => {
    const r = trierMailsRecus([], [l('Z', ['F12345678901']), l('Z', ['F12345678901'])]);
    egal(r.inconnus.length, 1);
  });
  test('deux mails pour le même dossier : un seul ajout', () => {
    const r = trierMailsRecus([d('A')], [l('A', ['F12345678901']), l('A', ['F22222222222'])]);
    egal(r.appliquer.length, 1);
    vrai(r.appliquer[0].fci.includes('F12345678901'));
  });
});
