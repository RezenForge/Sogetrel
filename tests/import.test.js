/**
 * import.test.js — R10, import d'un classeur Excel.
 * Le classeur d'essai (donnees/import-essai.xlsx) est fictif : il reprend la
 * forme du vrai (onglets 33, 16, 17, 79, colonnes D, E, I, J) avec des cas pièges.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { lireClasseur } from '../js/xlsx.js';
import { extraireDossiers, lireFciApresRepere, lireType } from '../js/import-excel.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';

const classeur = fetch(new URL('./donnees/import-essai.xlsx', import.meta.url)).then(r => r.arrayBuffer()).then(b => lireClasseur(b, { onglets: ['33', '16', '17', '79', '86'] }));
const existants = () => {
  const store = creerStore(supportMemoire());
  const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 3, 9) });
  regles.creer({ type: 'NUM21', gcblo: 'SBA501404-THF010', fci: 'F26154200726' });
  return { store, regles };
};

groupe('R10 — Lecture du classeur', () => {
  test('onglets du classeur, dans l\'ordre', async () => {
    const b = await fetch(new URL('./donnees/import-essai.xlsx', import.meta.url)).then(r => r.arrayBuffer());
    egal((await lireClasseur(b)).onglets, ['33', '16', '17 ', '79', 'BEIN']);
  });
  test('seuls les onglets demandés sont lus ; « 17 » suivi d\'un espace compte', async () => egal(Object.keys((await classeur).feuilles).sort(), ['16', '17', '33', '79']));
  test('cellules par colonne, numéro de ligne Excel', async () => {
    const l = (await classeur).feuilles['33'][1];
    egal([l.numero, l.cellules.D, l.cellules.E], [2, 'SBA501404-THF010', 'GCBLO']);
    vrai(l.cellules.J.includes('F26154200726'));
  });
  test('un fichier qui n\'est pas un classeur est refusé clairement', async () => {
    let msg = '';
    try { await lireClasseur(new TextEncoder().encode('bonjour')); } catch (e) { msg = e.message; }
    egal(msg, 'ce fichier n\'est pas un classeur Excel (.xlsx ou .xlsm)');
  });
});

groupe('R10 — Ce qui est importé', () => {
  test('FCI après le texte repère', () => {
    egal(lireFciApresRepere('Demande. Numéro de commande FCI : F26154200726 suite'), 'F26154200726');
    egal(lireFciApresRepere('Numero de commande FCI :F44444444444'), 'F44444444444');   // sans accent ni espace
    egal(lireFciApresRepere('numéro de commande fci :   f12345678901'), 'F12345678901');
    egal(lireFciApresRepere('rien'), '');
  });
  test('lignes GCBLO de la colonne E seulement', async () => egal(extraireDossiers(await classeur, existants().store.tous()).lus, 8));
  test('nouveaux dossiers (GCBLO remis en forme, FCI repris)', async () => {
    const r = extraireDossiers(await classeur, existants().store.tous());
    egal(r.nouveaux.map(n => [n.gcblo, n.fci]), [
      ['SBA501423-THF010', ['F09075260926']], ['POI500553-THF010', []], ['BRD600001-THF020', []],
      ['ANG700001-THF030', ['F44444444444']], ['NIO800001-THF040', ['F55555555555']]]);
  });
  test('type lu en colonne I ; vide ou inconnu → null (sera demandé)', async () => {
    const r = extraireDossiers(await classeur, existants().store.tous());
    egal(r.nouveaux.map(n => [n.gcblo, n.type]), [['SBA501423-THF010', 'AIR'], ['POI500553-THF010', 'NUM21'], ['BRD600001-THF020', 'SOGETREL'], ['ANG700001-THF030', null], ['NIO800001-THF040', null]]);
    egal(r.nouveaux.find(n => n.gcblo === 'NIO800001-THF040').typeLu, 'Fibre');
  });
  test('écritures du type tolérées', () => egal(['NUM21', 'num 21', 'Numérus 21', 'Air', 'AIR ', 'Sogetrel', 'SOGE', 'fibre', ''].map(lireType), ['NUM21', 'NUM21', 'NUM21', 'AIR', 'AIR', 'SOGETREL', 'SOGETREL', null, null]));
  test('dossier existant : seul le FCI manquant est ajouté', async () => {
    const r = extraireDossiers(await classeur, existants().store.tous());
    egal(r.completes.map(c => [c.dossier.gcblo, c.fci]), [['SBA501404-THF010', ['F33333333333']]]);
  });
  test('lignes refusées avec onglet et numéro de ligne', async () => {
    const r = extraireDossiers(await classeur, existants().store.tous());
    egal(r.refuses.map(x => [x.onglet, x.ligne, x.valeur]), [['33', 5, 'XYZ'], ['16', 3, '12345']]);
  });
  test('onglet absent signalé', async () => egal(extraireDossiers(await classeur, []).ongletsAbsents, ['86']));
  test('un second import n\'ajoute rien', async () => {
    const { store, regles } = existants();
    const r = extraireDossiers(await classeur, store.tous());
    regles.creerPlusieurs(r.nouveaux.map(n => ({ gcblo: n.gcblo, type: n.type || 'AIR', fci: n.fci })), { origine: 'import Excel' });
    r.completes.forEach(c => regles.modifier(c.dossier.id, { fci: [...c.dossier.fci, ...c.fci] }));
    const r2 = extraireDossiers(await classeur, store.tous());
    egal([r2.nouveaux.length, r2.completes.length, r2.deja], [0, 0, 6]);
    egal(store.parGcblo('NIO800001-THF040').historique[0].detail, 'Dossier créé (import Excel)');
    egal(store.parGcblo('BRD600001-THF020').type, 'SOGETREL');
  });
});
