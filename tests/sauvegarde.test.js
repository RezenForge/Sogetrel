/**
 * sauvegarde.test.js — nom, contenu et rotation des sauvegardes (3 gardées).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { nomSauvegarde, contenuSauvegarde, aSupprimer, lireSauvegarde } from '../js/sauvegarde.js';
import { ageSauvegarde, dessinerTableauBord, LARGEUR } from '../js/jarvis/tableau-bord.js';

groupe('Sauvegarde', () => {
  test('nom à la date et à l\'heure', () => egal(nomSauvegarde(new Date(2026, 10, 4, 9, 30, 5)), 'gcblo-sauvegarde_2026-11-04_09h30-05.json'));
  test('contenu relisible', () => {
    const c = JSON.parse(contenuSauvegarde([{ id: '1', gcblo: 'SBA501404-THF010' }], new Date(2026, 10, 4, 9, 30)));
    egal([c.app, c.dossiers.length], ['Registre GCBLO', 1]); vrai(c.sauvegardeLe.startsWith('2026-11-04'));
  });
  test('rotation : seules les 10 plus récentes restent', () => {
    const noms = Array.from({ length: 12 }, (_, i) => `gcblo-sauvegarde_2026-11-04_${String(i + 8).padStart(2, '0')}h00-00.json`);
    egal(aSupprimer([...noms.slice().reverse(), 'notes.txt']), ['gcblo-sauvegarde_2026-11-04_09h00-00.json', 'gcblo-sauvegarde_2026-11-04_08h00-00.json']);
  });
  test('moins de 10 : rien à supprimer, autres fichiers jamais touchés', () => egal(aSupprimer(['gcblo-sauvegarde_2026-11-04_09h30-05.json', 'rapport.xlsx']), []));
});

groupe('Sauvegarde — tableau de bord', () => {
  const m = new Date(2026, 10, 4, 15, 0);
  test('âge de la dernière sauvegarde', () => egal(
    [null, new Date(2026, 10, 4, 9, 30).toISOString(), new Date(2026, 10, 3, 18, 0).toISOString(), new Date(2026, 9, 20).toISOString()].map(i => ageSauvegarde(i, m)),
    [['jamais', 'retard'], ["aujourd'hui 09:30", 'st-ATTACH'], ['hier 18:00', 'st-ATTACH'], ['il y a 15 j', 'retard']]));
  test('ligne cliquable, largeur tenue', () => {
    const vide = { total: 0, parType: { NUM21: 0, AIR: 0, SOGETREL: 0 }, parStatut: { A_FAIRE: 0, EN_VALIDATION: 0, MAD: 0, REFUSE: 0, LITIGE: 0, ANNULE: 0, ATTACH: 0 }, retard: 0, proche: 0, sansFci: 0, aVenir: [0, 0, 0, 0, 0, 0, 0] };
    const r = dessinerTableauBord(vide, '2026-11-04', { derniereSauvegarde: null, maintenant: m });
    vrai(r.html.includes('data-commande="save"'));
    egal(r.texte.filter(l => [...l].length !== LARGEUR), []);
  });
});

groupe('Restauration', () => {
  const D = (gcblo, extra = {}) => ({ id: gcblo, gcblo, type: 'AIR', statutDft: 'A_FAIRE', fci: [], historique: [], dateAffectation: '2026-11-01', ...extra });
  test('relit ce que contenuSauvegarde écrit', () => {
    const r = lireSauvegarde(contenuSauvegarde([D('SBA501404-THF010', { commune: 'Mérignac', valorisation: 30 })], new Date(2026, 10, 4, 9, 30)));
    egal([r.dossiers.length, r.dossiers[0].commune, r.ignores], [1, 'Mérignac', 0]); vrai(r.le.startsWith('2026-11-04'));
  });
  test('dossiers illisibles ou en double ignorés', () => {
    const r = lireSauvegarde(JSON.stringify({ app: 'Registre GCBLO', dossiers: [D('SBA501404-THF010'), D('SBA501404-THF010'), D('XYZ'), { ...D('SBA501405-THF010'), statutDft: 'INCONNU' }] }));
    egal([r.dossiers.length, r.ignores], [1, 3]);
  });
  test('ancien dossier sans commune ni valo : complété', () => egal(lireSauvegarde(JSON.stringify({ app: 'Registre GCBLO', dossiers: [D('SBA501404-THF010')] })).dossiers[0].valorisation, null));
  test('autre fichier refusé clairement', () => {
    const msg = t => { try { lireSauvegarde(t); return ''; } catch (e) { return e.message; } };
    egal([msg('pas du json'), msg('{"a":1}')], ['ce fichier n\'est pas une sauvegarde lisible', 'ce fichier n\'est pas une sauvegarde du Registre GCBLO']);
  });
});
