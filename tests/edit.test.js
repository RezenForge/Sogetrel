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

groupe('attachement → statut Attach', () => {
  const preparer = async enregistrement => {
    const { lireClasseur } = await import('../js/xlsx.js');
    const { coffreMemoire } = await import('../js/coffre.js');
    const store = creerStore(supportMemoire());
    const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 4, 9) });
    const d = regles.creer({ type: 'AIR', gcblo: 'SBA501404-THF010', commune: 'Mérignac', valorisation: 30 }).dossier;
    const coffre = coffreMemoire();
    const octets = new Uint8Array(await (await fetch(new URL('./donnees/attachement-reference.xlsx', import.meta.url))).arrayBuffer());
    await lireClasseur(octets);
    await coffre.ecrire('attachement-reference', { nom: 'ref.xlsx', octets });
    const lignes = [];
    const ecran = { ligne: h => lignes.push(h), tableau() {}, fiche() {}, vider() {} };
    const ecrits = new Map(), destination = { name: 'Attachements' };
    let affichee = [];
    const actions = creerActions({ regles, store, ecran, coffre, enregistrerFichier: async () => enregistrement, confirmer: async () => true, demander: async () => null,
      choisirDossier: async () => destination, ecrireDansDossier: async (dossier, nom, octets) => { ecrits.set(nom, octets); } });
    const lancer = t => actions.executer(analyser(t, t.length, { dossiers: store.tous(), aujourdhui: '2026-11-04', regles, listeAffichee: () => affichee }));
    return { store, regles, d, lancer, lignes, ecrits, afficher: l => { affichee = l; } };
  };
  test('fichier enregistré : statut Attach, annulable', async () => {
    const e = await preparer('enregistre');
    await e.lancer('attachement 501404');
    egal(e.store.parId(e.d.id).statutDft, 'ATTACH');
    await e.lancer('cancel');
    egal(e.store.parId(e.d.id).statutDft, 'A_FAIRE');
  });
  test('enregistrement abandonné : statut inchangé', async () => {
    const e = await preparer('annule');
    await e.lancer('attachement 501404');
    egal(e.store.parId(e.d.id).statutDft, 'A_FAIRE');
  });
});

groupe('« * » et attachements en série', () => {
  const preparerSerie = async () => {
    const { lireClasseur } = await import('../js/xlsx.js');
    const { coffreMemoire } = await import('../js/coffre.js');
    const store = creerStore(supportMemoire());
    const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 4, 9) });
    ['SBA501401-THF010', 'SBA501402-THF010', 'SBA501403-THF010', 'SBA501404-THF010'].forEach((gcblo, i) => {
      const d = regles.creer({ type: 'AIR', gcblo, commune: 'Mérignac', valorisation: i === 3 ? null : 30 }).dossier;
      regles.modifier(d.id, { statutDft: i < 3 ? 'LITIGE' : 'MAD' });
    });
    const coffre = coffreMemoire();
    const octets = new Uint8Array(await (await fetch(new URL('./donnees/attachement-reference.xlsx', import.meta.url))).arrayBuffer());
    await coffre.ecrire('attachement-reference', { nom: 'ref.xlsx', octets });
    const ecrits = new Map(), lignes = [];
    let affichee = [];
    const ecran = { ligne: h => lignes.push(h), tableau() {}, fiche() {}, vider() {} };
    const actions = creerActions({ regles, store, ecran, coffre, confirmer: async () => true, demander: async () => null, enregistrerFichier: async () => 'enregistre',
      choisirDossier: async () => ({ name: 'Attachements' }), ecrireDansDossier: async (dossier, nom, o) => { ecrits.set(nom, o); } });
    const ctx = () => ({ dossiers: store.tous(), aujourdhui: '2026-11-04', regles, listeAffichee: () => affichee });
    const lancer = t => { const a = analyser(t, t.length, ctx()); return actions.executer(a); };
    return { store, regles, ecrits, lignes, lancer, ctx, afficher: l => { affichee = l; } };
  };
  test('* : la liste affichée', async () => {
    const e = await preparerSerie();
    e.afficher(e.regles.filtrer({ statut: 'LITIGE' }));
    const a = analyser('set * to annule', 15, e.ctx());
    egal(a.valeurs.cibles.length, 3);
    await e.lancer('set * to annule');
    egal(e.store.tous().filter(d => d.statutDft === 'ANNULE').length, 3);
  });
  test('* sans liste affichée : refusé clairement', async () => {
    const e = await preparerSerie();
    vrai(analyser('set * to annule', 15, e.ctx()).erreurs[0].includes('aucune liste affichée'));
  });
  test('attachement * : un fichier par dossier, tous en Attach, un seul cancel', async () => {
    const e = await preparerSerie();
    e.afficher(e.regles.filtrer({ statut: 'LITIGE' }));
    await e.lancer('attachement *');
    egal([...e.ecrits.keys()].sort(), ['SBA501401-THF010.xlsx', 'SBA501402-THF010.xlsx', 'SBA501403-THF010.xlsx']);
    egal(e.store.tous().filter(d => d.statutDft === 'ATTACH').length, 3);
    await e.lancer('cancel');
    egal(e.store.tous().filter(d => d.statutDft === 'LITIGE').length, 3);
  });
  test('attachement litige : tous les dossiers de ce statut, dans le dossier choisi', async () => {
    const e = await preparerSerie();
    await e.lancer('attachement litige');
    egal(e.ecrits.size, 3);
  });
  test('un seul dossier dans le statut : « Enregistrer sous » ; valorisation manquante signalée', async () => {
    const e = await preparerSerie();
    await e.lancer('attachement mis-a-dispo');
    egal([e.ecrits.size, e.store.parGcblo('SBA501404-THF010').statutDft], [0, 'ATTACH']);
    vrai(e.lignes.some(l => l.includes('valorisation vide')));
  });
});

groupe('Commande fci', () => {
  test('« fci ‹dossier› ‹fci› » est compris', async () => {
    const { analyser } = await import('../js/jarvis/analyse.js');
    const d = { id: 'x', gcblo: 'SBA501404-THF010', fci: [], type: 'AIR', statutDft: 'A_FAIRE', historique: [] };
    const a = analyser('fci SBA501404 F26154200726', 26, { dossiers: [d], aujourdhui: '2026-11-05' });
    egal([a.commande?.id, a.valeurs.cible?.gcblo, a.valeurs.valeur], ['fci', 'SBA501404-THF010', 'F26154200726']);
  });
});
