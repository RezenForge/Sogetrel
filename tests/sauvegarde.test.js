/**
 * sauvegarde.test.js — nom, contenu et rotation des sauvegardes (3 gardées).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { nomSauvegarde, contenuSauvegarde, aSupprimer } from '../js/sauvegarde.js';
import { ageSauvegarde, dessinerTableauBord, LARGEUR } from '../js/jarvis/tableau-bord.js';

groupe('Sauvegarde', () => {
  test('nom à la date et à l\'heure', () => egal(nomSauvegarde(new Date(2026, 10, 4, 9, 30, 5)), 'gcblo-sauvegarde_2026-11-04_09h30-05.json'));
  test('contenu relisible', () => {
    const c = JSON.parse(contenuSauvegarde([{ id: '1', gcblo: 'SBA501404-THF010' }], new Date(2026, 10, 4, 9, 30)));
    egal([c.app, c.dossiers.length], ['Registre GCBLO', 1]); vrai(c.sauvegardeLe.startsWith('2026-11-04'));
  });
  test('rotation : seules les 3 plus récentes restent', () => egal(aSupprimer([
    'gcblo-sauvegarde_2026-11-01_08h00-00.json', 'gcblo-sauvegarde_2026-11-04_09h30-05.json', 'notes.txt',
    'gcblo-sauvegarde_2026-11-03_17h12-40.json', 'gcblo-sauvegarde_2026-10-28_10h00-00.json', 'gcblo-sauvegarde_2026-11-02_12h00-00.json'
  ]), ['gcblo-sauvegarde_2026-11-01_08h00-00.json', 'gcblo-sauvegarde_2026-10-28_10h00-00.json']));
  test('moins de 3 : rien à supprimer, autres fichiers jamais touchés', () => egal(aSupprimer(['gcblo-sauvegarde_2026-11-04_09h30-05.json', 'rapport.xlsx']), []));
});

groupe('Sauvegarde — tableau de bord', () => {
  const m = new Date(2026, 10, 4, 15, 0);
  test('âge de la dernière sauvegarde', () => egal(
    [null, new Date(2026, 10, 4, 9, 30).toISOString(), new Date(2026, 10, 3, 18, 0).toISOString(), new Date(2026, 9, 20).toISOString()].map(i => ageSauvegarde(i, m)),
    [['jamais', 'retard'], ["aujourd'hui 09:30", 'st-ATTACH'], ['hier 18:00', 'st-ATTACH'], ['il y a 15 j', 'retard']]));
  test('ligne cliquable, largeur tenue', () => {
    const vide = { total: 0, parType: { NUM21: 0, AIR: 0, SOGETREL: 0 }, parStatut: { A_FAIRE: 0, EN_VALIDATION: 0, MAD: 0, REFUSE: 0, LITIGE: 0, ANNULE: 0, ATTACH: 0 }, retard: 0, proche: 0, sansFci: 0, aVenir: [0, 0, 0, 0, 0, 0, 0] };
    const r = dessinerTableauBord(vide, '2026-11-04', { derniereSauvegarde: null, maintenant: m });
    vrai(r.html.includes('data-commande="sauvegarde"'));
    egal(r.texte.filter(l => [...l].length !== LARGEUR), []);
  });
});
