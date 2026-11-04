/**
 * tableau-bord.test.js — le tableau de bord ASCII, à droite de la console.
 * Ce qui compte : toutes les lignes ont la même largeur (sinon le cadre se casse),
 * et les chiffres affichés sont les bons.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { dessinerTableauBord, barre, etincelle, LARGEUR } from '../js/jarvis/tableau-bord.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';

const S = {
  total: 85, parType: { NUM21: 52, AIR: 30, SOGETREL: 3 },
  parStatut: { A_FAIRE: 30, EN_VALIDATION: 15, MAD: 12, REFUSE: 3, LITIGE: 2, ANNULE: 3, ATTACH: 20 },
  retard: 14, proche: 2, sansFci: 7, aVenir: [2, 0, 5, 1, 0, 0, 3],
  valo: { total: 4321.5, parStatut: { A_FAIRE: 1000, EN_VALIDATION: 500, MAD: 300, REFUSE: 0, LITIGE: 21.5, ANNULE: 100, ATTACH: 2400 }, sans: 4 }
};
const largeur = l => [...l].length;
const vide = { total: 0, parType: { NUM21: 0, AIR: 0, SOGETREL: 0 }, parStatut: { A_FAIRE: 0, EN_VALIDATION: 0, MAD: 0, REFUSE: 0, LITIGE: 0, ANNULE: 0, ATTACH: 0 },
  retard: 0, proche: 0, sansFci: 0, aVenir: [0, 0, 0, 0, 0, 0, 0], valo: { total: 0, parStatut: {}, sans: 0 } };

groupe('Tableau de bord ASCII', () => {
  test('toutes les lignes ont la même largeur', () => egal(dessinerTableauBord(S, '2026-11-04').texte.filter(l => largeur(l) !== LARGEUR), []));
  test('largeur tenue aussi sans aucun dossier', () => egal(dessinerTableauBord(vide, '2026-11-04').texte.filter(l => largeur(l) !== LARGEUR), []));
  test('cadre, date et sections', () => {
    const t = dessinerTableauBord(S, '2026-11-04').texte;
    vrai(t[0].startsWith('┌─ tableau de bord') && t[0].includes('mer 04/11') && t.at(-1).startsWith('└'));
    vrai(['affect', 'statut DFT', 'avancement', 'valorisation'].every(s => t.some(l => l.includes(s))));
    vrai(!t.some(l => l.includes('relances')));
  });
  test('les 7 statuts DFT', () => vrai(['À faire', 'En valid.', 'Mis à disp', 'Refusé', 'Litige', 'Annulé', 'Attach'].every(s => dessinerTableauBord(S, '2026-11-04').texte.some(l => l.includes(s)))));
  test('avancement : clos = mis à dispo + annulé + attach', () => vrai(dessinerTableauBord(S, '2026-11-04').texte.some(l => l.includes('41 %') && l.includes('clos'))));   // 35 / 85
  test('valorisation : total, attaché, à attacher (hors annulé)', () => {
    const t = dessinerTableauBord(S, '2026-11-04').texte.map(l => l.replace(/\s+/g, ' '));
    vrai(t.some(l => l.includes('total 4 321,50 €')));
    vrai(t.some(l => l.includes('attaché 2 400,00 €')));
    vrai(t.some(l => l.includes('à attacher 1 821,50 €')));
  });
  test('barre et étincelle', () => { egal(barre(1, 1000, 10)[0], '█'); egal(etincelle([0, 1, 4]).join(''), '·▂█'); });
});

groupe('Statistiques — valorisation', () => {
  test('total, par statut, dossiers sans valorisation', () => {
    const r = creerDossiers(creerStore(supportMemoire()));
    r.creer({ type: 'AIR', gcblo: 'SBA501001-THF010', valorisation: 31.5 });
    const d = r.creer({ type: 'AIR', gcblo: 'SBA501002-THF010', valorisation: 58.4 }).dossier;
    r.modifier(d.id, { statutDft: 'ATTACH' });
    r.creer({ type: 'AIR', gcblo: 'SBA501003-THF010' });
    const v = r.statistiques().valo;
    egal([v.total, v.parStatut.ATTACH, v.parStatut.A_FAIRE, v.sans], [89.9, 58.4, 31.5, 1]);
  });
});

groupe('Tableau de bord cliquable', () => {
  const html = dessinerTableauBord(S, '2026-11-04').html;
  const commandes = [...html.matchAll(/data-commande="([^"]+)"/g)].map(m => m[1]);
  test('chaque affect et chaque statut lance ls', () => vrai(['ls num21', 'ls air', 'ls sogetrel', 'ls a-faire', 'ls en-validation', 'ls mis-a-dispo', 'ls refuse', 'ls litige', 'ls annule', 'ls attach'].every(c => commandes.includes(c))));
  test('sans affect (« - ») et valorisation aussi', () => vrai(['ls sans-affect', 'ls sans-valo', 'ls'].every(c => commandes.includes(c))));
  test('« - » affiché même à zéro', () => vrai(dessinerTableauBord(vide, '2026-11-04').texte.some(l => /^│ - /.test(l))));
  test('toutes ces commandes sont comprises', async () => {
    const { analyser } = await import('../js/jarvis/analyse.js');
    const store = creerStore(supportMemoire()), regles = creerDossiers(store);
    egal([...new Set(commandes)].filter(c => !analyser(c, c.length, { dossiers: [], aujourdhui: '2026-11-04', regles }).complet), []);
  });
  test('filtres proches et sans-valo', () => {
    const r = creerDossiers(creerStore(supportMemoire()), { horloge: () => new Date(2026, 10, 4, 9) });
    r.creer({ type: 'AIR', gcblo: 'SBA501001-THF010', dateRelance: '2026-11-05', valorisation: 30 });
    r.creer({ type: 'AIR', gcblo: 'SBA501002-THF010', dateRelance: '2026-11-30' });
    egal([r.filtrer({ proche: true }).length, r.filtrer({ sansValo: true })[0].gcblo], [1, 'SBA501002-THF010']);
  });
});

import { ageCourt } from '../js/jarvis/tableau-bord.js';
groupe('Tableau de bord — synchro et sections repliables', () => {
  const m = new Date(2026, 10, 4, 15, 0);
  const iso = (...a) => new Date(2026, ...a).toISOString();
  test('âge court et couleur', () => egal(
    [null, iso(10, 4, 14, 59), iso(10, 4, 14, 35), iso(10, 4, 11, 0), iso(10, 3, 14, 0), iso(9, 30, 9, 0)].map(i => ageCourt(i, m, { orange: 2, rouge: 24 })),
    [['jamais', 'retard'], ["à l'instant", 'st-ATTACH'], ['il y a 25 min', 'st-ATTACH'], ['il y a 4 h', 'proche'], ['hier 14:00', 'retard'], ['il y a 5 j', 'retard']]));
  test('section synchro : sauvegarde et macro Excel', () => {
    const t = dessinerTableauBord(S, '2026-11-04', { derniereSauvegarde: iso(10, 4, 14, 30), classeur: null, maintenant: m }).texte;
    vrai(t.some(l => l.includes('synchro')) && t.some(l => l.includes('il y a 30 min')) && t.some(l => l.includes('macro Excel') && l.includes('jamais')));
    egal(t.filter(l => [...l].length !== LARGEUR), []);
  });
  test('section repliée : seul son titre reste, avec ▸', () => {
    const b = dessinerTableauBord(S, '2026-11-04', { replies: ['statut DFT'] });
    vrai(b.texte.some(l => l.includes('▸ statut DFT')) && !b.texte.some(l => l.includes('En valid.')) && b.texte.some(l => l.includes('▾ affect')));
    vrai(b.html.includes('data-repli="statut DFT"'));
    egal(b.texte.filter(l => [...l].length !== LARGEUR), []);
  });
});

import { pointDuJour } from '../js/jarvis/aujourdhui.js';
groupe('Aujourd\'hui — ce qui demande une action', () => {
  test('seulement les lignes à traiter, dans l\'ordre d\'urgence', () => egal(
    pointDuJour({ fciRetard: 2, retard: 0, proche: 1, parType: { SANS: 3 }, parStatut: { LITIGE: 1, REFUSE: 0 } }, { ecartsAffect: 4 }).map(l => [l.n, l.commande]),
    [[2, 'ls fci-retard'], [1, 'ls litige'], [4, 'ls ecart-affect'], [3, 'ls sans-affect'], [1, 'ls proches']]));
  test('rien à faire : liste vide', () => egal(pointDuJour({ parType: {}, parStatut: {} }), []));
});
