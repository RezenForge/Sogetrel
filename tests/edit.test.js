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
      choisirDossier: async () => (enregistrement === 'annule' ? null : destination), ecrireDansDossier: async (dossier, nom, octets) => { ecrits.set(nom, octets); } });
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
    egal([...e.ecrits.keys()].sort(), ['SBA501401-THF010.xlsx', 'SBA501402-THF010.xlsx', 'SBA501403-THF010.xlsx', 'mails-attachement.csv']);
    egal(e.store.tous().filter(d => d.statutDft === 'ATTACH').length, 3);
    await e.lancer('cancel');
    egal(e.store.tous().filter(d => d.statutDft === 'LITIGE').length, 3);
  });
  test('attachement litige : tous les dossiers de ce statut, dans le dossier choisi', async () => {
    const e = await preparerSerie();
    await e.lancer('attachement litige');
    egal(e.ecrits.size, 4);              // 3 attachements + mails-attachement.csv
  });
  test('un seul dossier : dans le dossier des attachements, avec son mail ; valorisation manquante signalée', async () => {
    const e = await preparerSerie();
    await e.lancer('attachement mis-a-dispo');
    egal([[...e.ecrits.keys()].sort(), e.store.parGcblo('SBA501404-THF010').statutDft], [['SBA501404-THF010.xlsx', 'mails-attachement.csv'], 'ATTACH']);
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

groupe('R15 — Mails d\'attachement préparés pour Outlook', () => {
  const preparer = async (existant = null) => {
    const { coffreMemoire } = await import('../js/coffre.js');
    const store = creerStore(supportMemoire());
    const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 5, 9) });
    regles.creer({ type: 'NUM21', gcblo: 'SBA300497-THF010', commune: 'Mérignac', valorisation: 30 });
    regles.creer({ type: 'AIR', gcblo: 'BOR300498-THF010', commune: 'Pessac', valorisation: 30 });
    regles.creer({ type: 'SOGETREL', gcblo: 'SBA300499-THF010', commune: 'Eysines', valorisation: 30 });
    const coffre = coffreMemoire();
    const octets = new Uint8Array(await (await fetch(new URL('./donnees/attachement-reference.xlsx', import.meta.url))).arrayBuffer());
    await coffre.ecrire('attachement-reference', { nom: 'ref.xlsx', octets });
    const ecrits = new Map(), lignes = [], appels = [];
    if (existant !== null) ecrits.set('mails-attachement.csv', existant);
    const ecran = { ligne: h => lignes.push(h), tableau() {}, fiche() {}, vider() {} };
    const actions = creerActions({ regles, store, ecran, coffre, confirmer: async () => true, demander: async () => null, enregistrerFichier: async () => 'enregistre',
      choisirDossier: async (id, o = {}) => { appels.push([id, o]); return { name: 'Attachements' }; },
      ecrireDansDossier: async (dossier, nom, o) => { ecrits.set(nom, o); }, lireDansDossier: async (dossier, nom) => ecrits.get(nom) ?? null });
    const lancer = t => actions.executer(analyser(t, t.length, { dossiers: store.tous(), aujourdhui: '2026-11-05', regles, listeAffichee: () => [] }));
    return { store, ecrits, lignes, appels, lancer };
  };
  const csv = e => e.ecrits.get('mails-attachement.csv').replace(/^\uFEFF/, '').trim().split('\r\n');
  test('une ligne par dossier NUM21 / AIR, rien pour Sogetrel', async () => {
    const e = await preparer();
    await e.lancer('attachement SBA300497 BOR300498 SBA300499');
    const l = csv(e);
    egal(l[0], 'GCBLO;FICHIER;A;CC;OBJET;CORPS');
    egal(l.slice(1).map(x => x.split(';').slice(0, 5)), [
      ['SBA300497-THF010', 'SBA300497-THF010.xlsx', 'info_lpc_BL@sogetrel.fr', 'Romain.BOUTINEAU@sogetrel.fr oelmahdaoui@numerus21.fr', 'ATTACHEMENT GCBLO | SBA300497-THF010 | NUM21'],
      ['BOR300498-THF010', 'BOR300498-THF010.xlsx', 'info_aquitaine_BL@sogetrel.fr', 'Romain.BOUTINEAU@sogetrel.fr jeremie-sannier@air-reseaux.com', 'ATTACHEMENT GCBLO | BOR300498-THF010 | AIR']]);
    vrai(e.lignes.some(h => h.includes('SBA300499-THF010') && h.includes('pas de mail')));
    vrai(e.lignes.some(h => h.includes('BrouillonsAttachement')));
  });
  test('ajoutés aux mails en attente ; un GCBLO refait remplace sa ligne', async () => {
    const e = await preparer('\uFEFFGCBLO;FICHIER;A;CC;OBJET;CORPS\r\nLRO100000-THF010;LRO100000-THF010.xlsx;a;b;c;d\r\nSBA300497-THF010;vieux;a;b;c;d\r\n');
    await e.lancer('attachement SBA300497');
    egal(csv(e).slice(1).map(x => x.split(';')[0]), ['LRO100000-THF010', 'SBA300497-THF010']);
    egal(csv(e)[2].split(';')[1], 'SBA300497-THF010.xlsx');
  });
  test('un seul dossier : pas d\'« Enregistrer sous », le dossier des attachements', async () => {
    const e = await preparer();
    await e.lancer('attachement SBA300497');
    vrai(e.ecrits.has('SBA300497-THF010.xlsx'));
    egal(e.appels, [['gcblo-attachements', {}]]);
  });
  test('attachement folder : change le dossier, ne crée rien', async () => {
    const e = await preparer();
    await e.lancer('attachement folder');
    egal(e.appels, [['gcblo-attachements', { changer: true }]]);
    egal(e.ecrits.size, 0);
  });
});

groupe('R22 — sync … lies : la tournée passe sur les dossiers liés', () => {
  const preparer = () => {
    const store = creerStore(supportMemoire());
    const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 9, 9) });
    regles.creer({ type: 'NUM21', gcblo: 'SBA301460-THF010', dateAffectation: '2026-11-01' });
    regles.creer({ type: 'AIR', gcblo: 'BOR301461-THF010', dateAffectation: '2026-11-01' });
    localStorage.setItem('gcblo.v2.dossiersLies', JSON.stringify({ SBA301460: [{ dossier: 'SBA301460-ACD010', valo: 900 }, { dossier: 'SBA301460-ACF020', valo: 12000 }] }));
    let envoyes = null;
    const ecran = { ligne() {}, tableau() {}, fiche() {}, vider() {} };
    const actions = creerActions({ regles, store, ecran, confirmer: async () => true, demander: async () => null, lancerTournee: async items => { envoyes = items; return true; } });
    const lancer = t => actions.executer(analyser(t, t.length, { dossiers: store.tous(), aujourdhui: '2026-11-09', regles, listeAffichee: () => [] }));
    return { lancer, items: () => envoyes };
  };
  test('sync lies : les liés de chaque dossier, rattachés au principal, plus gros d\'abord', async () => {
    const e = preparer();
    await e.lancer('sync lies');
    egal(e.items().map(i => [i.gcblo, i.principal]), [['SBA301460-ACF020', 'SBA301460-THF010'], ['SBA301460-ACD010', 'SBA301460-THF010']]);
    vrai(e.items()[0].url.includes('/SBA/') && e.items()[0].url.includes('/ACF02-0/'));
  });
  test('sync air lies : filtre puis liés (aucun ici)', async () => {
    const e = preparer();
    await e.lancer('sync air lies');
    egal(e.items(), null);
  });
  test('sync sans lies : inchangé', async () => {
    const e = preparer();
    await e.lancer('sync');
    egal(e.items().map(i => i.gcblo).sort(), ['BOR301461-THF010', 'SBA301460-THF010']);
    egal(e.items()[0].principal, undefined);
  });
});
