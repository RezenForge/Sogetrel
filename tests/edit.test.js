/**
 * edit.test.js — modifier un champ d'un dossier (commande « edit », aussi lancée
 * par le double-clic dans une fiche).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { analyser } from '../js/jarvis/analyse.js';
import { creerActions } from '../js/jarvis/actions.js';

function env() {
  const store = creerStore(supportMemoire());
  const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 3, 9) });
  const d = regles.creer({ type: 'NUM21', gcblo: 'SBA501404-THF010', fci: 'F26154200726', commune: 'Mérignac', valorisation: 31.5, dateRelance: '2026-11-10' }).dossier;
  const lignes = [];
  const ecran = { ligne: (html, classe) => lignes.push({ html, classe }), tableau() {}, fiche() {}, vider() {} };
  const actions = creerActions({ regles, store, ecran, confirmer: async () => true, demander: async () => null });
  const ctx = () => ({ dossiers: store.tous(), aujourdhui: '2026-11-03', regles });
  const lancer = async texte => { const a = analyser(texte, texte.length, ctx()); vrai(a.complet, `incomplet : ${texte}`); await actions.executer(a); };
  return { store, regles, d, lignes, lancer, get: () => store.parId(d.id) };
}

groupe('edit — lecture de la commande', () => {
  const ctx = () => { const e = env(); return { dossiers: e.store.tous(), aujourdhui: '2026-11-03', regles: e.regles }; };
  test('champ et valeur (le reste de la ligne)', () => {
    const a = analyser('edit 501404 commune Le Haillan', 30, ctx());
    vrai(a.complet); egal([a.valeurs.champ, a.valeurs.valeur], ['commune', 'Le Haillan']);
  });
  test('champ inconnu refusé', () => vrai(analyser('edit 501404 couleur bleu', 24, ctx()).erreurs[0].includes('champ inconnu')));
});

groupe('edit — modifications', () => {
  test('commune avec espaces', async () => { const e = env(); await e.lancer('edit 501404 commune Le Haillan'); egal(e.get().commune, 'Le Haillan'); });
  test('valo en écriture française', async () => { const e = env(); await e.lancer('edit 501404 valo 58,40'); egal(e.get().valorisation, 58.4); });
  test('plusieurs FCI', async () => { const e = env(); await e.lancer('edit 501404 fci F26154200726 F11111111111'); egal(e.get().fci, ['F26154200726', 'F11111111111']); });
  test('relance : date française, puis vidée', async () => {
    const e = env();
    await e.lancer('edit 501404 relance 20/11/2026'); egal(e.get().dateRelance, '2026-11-20');
    await e.lancer('edit 501404 relance -'); egal(e.get().dateRelance, null);
  });
  test('affect et statut', async () => {
    const e = env();
    await e.lancer('edit 501404 affect air'); await e.lancer('edit 501404 statut refuse');
    egal([e.get().type, e.get().statutDft], ['AIR', 'REFUSE']);
  });
  test('commune vidée avec « - »', async () => { const e = env(); await e.lancer('edit 501404 commune -'); egal(e.get().commune, ''); });
  test('valeur refusée : rien ne change, erreur affichée', async () => {
    const e = env();
    await e.lancer('edit 501404 valo beaucoup');
    egal(e.get().valorisation, 31.5); vrai(e.lignes.at(-1).classe === 'err');
  });
  test('GCBLO corrigé, doublon refusé', async () => {
    const e = env();
    e.regles.creer({ type: 'AIR', gcblo: 'SBA501423-THF010' });
    await e.lancer('edit 501404 gcblo SBA501423-THF010'); egal(e.get().gcblo, 'SBA501404-THF010');
    await e.lancer('edit 501404 gcblo sba501405-thf010'); egal(e.get().gcblo, 'SBA501405-THF010');
  });
  test('historique et cancel', async () => {
    const e = env();
    await e.lancer('edit 501404 commune Pessac');
    egal(e.get().historique.at(-1).detail, 'Commune : Mérignac → Pessac');
    await e.lancer('cancel'); egal(e.get().commune, 'Mérignac');
  });
});
