/**
 * main.js — le démarrage. Il ne contient aucune règle : il crée les modules
 * et les branche entre eux, dans cet ordre :
 *
 *   store (données)  →  regles (dossiers.js)  →  invite (écran)  →  actions
 *
 * Au premier lancement, si la v1 a laissé des dossiers dans ce navigateur,
 * ils sont repris automatiquement.
 */
import { lireCsvMailsRecus, trierMailsRecus, NOM_CSV_MAILS_RECUS } from './mails-recus.js';
import { creerStore, supportNavigateur, supportMemoire } from './store.js';
import { creerDossiers } from './dossiers.js';
import { creerReglages } from './reglages.js';
import { creerCoffre } from './coffre.js';
import { aSupprimer, nomSauvegarde, contenuSauvegarde } from './sauvegarde.js';
import { csvRegistre, NOM_CSV, NOM_CSV_CLASSEUR, lireCsvClasseur } from './export-excel.js';
import { extraireDossiers, appliquerImport } from './import-excel.js';
import { lireAffectsClasseur, noterAffectsClasseur, ecartAffect } from './affects-classeur.js';
import { extraireLies, noterLies, lireLies, totalLies } from './dossiers-lies.js';
import { SAUVEGARDE_AUTO_HEURES, statutParCode } from './config.js';
import { aujourdhui } from './dates.js';
import { convertirV1, lireV1Navigateur } from './reprise-v1.js';
import { creerInvite } from './jarvis/invite.js';
import { creerActions, esc, texteClasseur } from './jarvis/actions.js';
import { dessinerTableauBord } from './jarvis/tableau-bord.js';

/** Date de la dernière sauvegarde (affichée dans le tableau de bord). */
const CLE_DERNIERE_SAUVEGARDE = 'gcblo.v2.derniereSauvegarde';
/** Date du dernier classeur-gcblo.csv lu (écrit par la macro Excel) et sections repliées du tableau de bord. */
const CLE_CLASSEUR_LE = 'gcblo.v2.classeurLe', CLE_REPLIES = 'gcblo.v2.bordReplies';
const lireLocal = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; } } };

/* 1. Les données. Si le navigateur refuse le stockage, on travaille en mémoire (et on prévient). */
let stockageOk = true;
try { localStorage.setItem('gcblo.test', '1'); localStorage.removeItem('gcblo.test'); } catch { stockageOk = false; }
const store = creerStore(stockageOk ? supportNavigateur() : supportMemoire());
const regles = creerDossiers(store);
const reglages = creerReglages();

/* 2. Reprise de la v1, une seule fois (seulement si la v2 est encore vide). */
let reprise = null;
if (!store.tous().length) {
  const v1 = lireV1Navigateur();
  if (v1) {
    reprise = convertirV1(v1);
    if (reprise.dossiers.length) store.remplacerTout(reprise.dossiers);
  }
}

/* 3. L'écran. Le contexte est relu à chaque touche, pour toujours voir les données à jour. */
const recents = [];
const invite = creerInvite({
  racine: document,
  contexte: () => ({
    dossiers: store.tous(),
    aujourdhui: aujourdhui(new Date()),
    regles,
    reglages,
    recents,
    // « * » : les dossiers de la dernière liste affichée dans la console (ls, info)
    listeAffichee: () => invite.listeAffichee(),
    // Les commandes utilisées récemment remontent en tête des propositions
    memoriser: id => { const i = recents.indexOf(id); if (i >= 0) recents.splice(i, 1); recents.unshift(id); }
  })
});

/*
 * Avant d'ouvrir l'explorateur de fichiers. Sous Windows, si la commande a été lancée au
 * clavier (Entrée), l'explorateur peut s'ouvrir avec le pointeur de souris caché (option
 * « Masquer le pointeur pendant la frappe » + Chrome/Edge). Seule parade fiable : l'ouvrir
 * depuis un clic de souris. Donc :
 *   - commande lancée à la souris (tableau de bord, menu ⋯, lien) : l'explorateur s'ouvre tout de suite ;
 *   - commande lancée au clavier : un bouton « ouvrir l'explorateur » s'affiche, on clique dessus
 *     (Échap pour abandonner).
 * Renvoie true pour ouvrir, false si abandon.
 */
let derniereEntree = 'souris';
addEventListener('keydown', e => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) derniereEntree = 'clavier'; }, true);
addEventListener('pointerdown', () => { derniereEntree = 'souris'; }, true);
function avantExplorateur() {
  if (derniereEntree === 'souris') return Promise.resolve(true);
  return new Promise(ok => {
    const id = `explorateur-${Date.now()}`;
    invite.ecran.ligne(`<button type="button" id="${id}" class="lien c-verbe">▸ ouvrir l'explorateur</button> <span class="dim">· clic de souris · Échap pour abandonner</span>`, 'info');
    const bouton = document.getElementById(id);
    const finir = choix => {
      removeEventListener('keydown', echap, true);
      bouton?.closest('.l')?.remove();
      ok(choix);
    };
    const echap = e => { if (e.key === 'Escape') { e.preventDefault(); finir(false); } };
    addEventListener('keydown', echap, true);
    if (!bouton) return finir(true);
    bouton.addEventListener('click', e => { e.stopPropagation(); finir(true); }, { once: true });
  });
}

/* Sauvegardes : écriture dans un dossier, avec rotation (3 gardées), et sauvegarde automatique. */
const coffre = creerCoffre();
function noterSauvegarde() {
  try { localStorage.setItem(CLE_DERNIERE_SAUVEGARDE, new Date().toISOString()); } catch { /* facultatif */ }
  dessinerBord();
}
/*
 * R14 — lit classeur-gcblo.csv (écrit par la macro du classeur partagé) s'il est dans le dossier,
 * et intègre les nouveaux GCBLO comme « import » : création, ou complément de ce qui manque.
 * Renvoie null s'il n'y a pas de fichier.
 */
async function lireClasseurPartage(dossier) {
  let poignee;
  try { poignee = await dossier.getFileHandle(NOM_CSV_CLASSEUR); } catch { return null; }
  const fichier = await poignee.getFile();
  // Pour le tableau de bord (synchro) : quand la macro a écrit ce fichier pour la dernière fois
  try { localStorage.setItem(CLE_CLASSEUR_LE, new Date(fichier.lastModified).toISOString()); } catch { /* facultatif */ }
  const classeur = lireCsvClasseur(await fichier.text());
  const r = extraireDossiers(classeur, store.tous());
  noterAffectsClasseur(r.affects);
  const fait = appliquerImport(regles, r, 'classeur partagé');
  // Les dossiers liés (même affaire, autre suffixe) : remplacés en entier à chaque lecture
  noterLies(extraireLies(classeur, store.tous().map(d => d.gcblo)));
  return { lus: r.lus, crees: fait.crees.map(d => d.gcblo), completes: fait.avant.length, refuses: r.refuses.length + fait.refuses.length, le: fichier.lastModified };
}

/*
 * R18 — FCI reçus par mail : mails-gcblo.csv (écrit par la macro Outlook LireFciMails) dans le dossier des
 * sauvegardes, lu chaque minute et à chaque sauvegarde. Dossier sans FCI : le FCI est appliqué (commande fci,
 * annulable) et l'historique note le mail. Autre FCI déjà connu, ou GCBLO absent : signalé une seule fois.
 */
const CLE_MAILS_SIGNALES = 'gcblo.v2.mailsSignales';
let derniereLectureMails = { modifie: 0, lu: 0 };
async function lireMailsRecus(dossier) {
  let fichier;
  try { fichier = await (await dossier.getFileHandle(NOM_CSV_MAILS_RECUS)).getFile(); } catch { return; }
  // Fichier inchangé depuis la dernière lecture : rien de neuf (relu quand même toutes les 10 min,
  // pour un GCBLO créé entre-temps)
  if (fichier.lastModified === derniereLectureMails.modifie && Date.now() - derniereLectureMails.lu < 10 * 60 * 1000) return;
  derniereLectureMails = { modifie: fichier.lastModified, lu: Date.now() };
  const { appliquer, differents, inconnus } = trierMailsRecus(store.tous(), lireCsvMailsRecus(await fichier.text()));
  const quand = l => `${l.de ? ` de ${l.de}` : ''}${l.recuLe ? ` le ${l.recuLe}` : ''}`;
  for (const a of appliquer) {
    regles.noter(a.dossier.id, 'mail', `FCI reçu par mail${quand(a.ligne)} : ${a.fci.join(' ')}`);
    invite.ecran.journal(`✉ FCI reçu par mail · ${esc(a.dossier.gcblo)} → ${esc(a.fci.join(' '))}<span class="dim">${esc(quand(a.ligne))}</span>`, 'ok');
    lancerDepuisLine(`fci ${a.dossier.gcblo} ${[...new Set([...a.dossier.fci, ...a.fci])].join(' ')}`);
  }
  const signales = new Set(lireLocal(CLE_MAILS_SIGNALES, []));
  const nouveau = cle => { if (signales.has(cle)) return false; signales.add(cle); return true; };
  for (const a of differents) {
    if (nouveau(`${a.dossier.gcblo}:${a.fci.join(' ')}`)) invite.ecran.journal(`<span class="dim">✉ ${esc(a.dossier.gcblo)} : un mail${esc(quand(a.ligne))} donne le FCI ${esc(a.fci.join(' '))}, le registre a ${esc(a.dossier.fci.join(' '))} · à vérifier (rien changé)</span>`, 'info');
  }
  for (const l of inconnus) {
    if (nouveau(`${l.gcblo}:?`)) invite.ecran.journal(`<span class="dim">✉ FCI ${esc(l.fci.join(' '))} reçu par mail pour ${esc(l.gcblo)}, absent du registre</span>`, 'info');
  }
  try { localStorage.setItem(CLE_MAILS_SIGNALES, JSON.stringify([...signales].slice(-500))); } catch { /* facultatif */ }
}
async function lireMailsSiAccesDonne() {
  let dossier;
  try { dossier = await coffre.lire('dossier-sauvegarde'); } catch { return; }
  try { if (dossier?.queryPermission && await dossier.queryPermission({ mode: 'readwrite' }) === 'granted') await lireMailsRecus(dossier); } catch { /* rien */ }
}

async function ecrireSauvegarde(dossier, nom, contenu) {
  // D'abord les nouveautés du classeur partagé : la sauvegarde et le CSV les contiennent déjà
  let classeur = null;
  try { classeur = await lireClasseurPartage(dossier); } catch (e) { invite.ecran.journal(`gcblo: ${esc(NOM_CSV_CLASSEUR)} illisible : ${esc(e.message)}`, 'err'); }
  try { derniereLectureMails = { modifie: 0, lu: 0 }; await lireMailsRecus(dossier); } catch (e) { invite.ecran.journal(`gcblo: ${esc(NOM_CSV_MAILS_RECUS)} illisible : ${esc(e.message)}`, 'err'); }
  const texte = typeof contenu === 'function' ? contenu() : contenu;
  const fichier = await dossier.getFileHandle(nom, { create: true });
  const flux = await fichier.createWritable();
  await flux.write(texte); await flux.close();
  // R14 : à côté, le CSV pour le classeur partagé (toujours le même nom, remplacé à chaque fois)
  const csv = await dossier.getFileHandle(NOM_CSV, { create: true });
  const fluxCsv = await csv.createWritable();
  await fluxCsv.write(csvRegistre(store.tous())); await fluxCsv.close();
  const noms = [];
  for await (const [n, h] of dossier.entries()) if (h.kind === 'file') noms.push(n);
  const supprimes = aSupprimer(noms);
  for (const n of supprimes) await dossier.removeEntry(n);
  noterSauvegarde();
  return { supprimes, classeur };
}

/**
 * Le dossier de sauvegarde retenu, s'il est encore accessible. Si le navigateur redemande
 * l'accès (après une fermeture), il affiche une petite question « Autoriser » : pas d'explorateur.
 */
async function dossierConnu() {
  let dossier;
  try { dossier = await coffre.lire('dossier-sauvegarde'); } catch { return null; }
  if (!dossier?.queryPermission) return null;
  try {
    if (await dossier.queryPermission({ mode: 'readwrite' }) === 'granted') return dossier;
    if (await dossier.requestPermission({ mode: 'readwrite' }) === 'granted') return dossier;
  } catch { /* refusé, ou dossier disparu */ }
  return null;
}

/*
 * Sauvegarde automatique toutes les SAUVEGARDE_AUTO_HEURES heures, tant que l'appli est ouverte,
 * dans le dernier dossier choisi avec « save ». Le navigateur peut redemander l'autorisation
 * d'écrire dans ce dossier (après une fermeture, par exemple) : il faut alors un clic, on le signale.
 */
let autorisationSignalee = false, sauvegardeEnCours = false;
async function sauvegardeAutomatique() {
  if (sauvegardeEnCours || !store.tous().length) return;
  const derniere = derniereSauvegarde();
  if (derniere && Date.now() - new Date(derniere).getTime() < SAUVEGARDE_AUTO_HEURES * 3600 * 1000) return;
  let dossier;
  try { dossier = await coffre.lire('dossier-sauvegarde'); } catch { return; }
  if (!dossier?.queryPermission) return;                  // jamais de dossier choisi : rien à faire
  sauvegardeEnCours = true;
  try {
    if (await dossier.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (!autorisationSignalee) invite.ecran.journal(`<span class="dim">sauvegarde automatique en attente : le navigateur redemande l'accès au dossier ·</span> <button type="button" class="lien c-verbe" data-commande="save">save</button>`, 'info');
      autorisationSignalee = true;
      return;
    }
    const maintenant = new Date(), nom = nomSauvegarde(maintenant);
    const { supprimes, classeur } = await ecrireSauvegarde(dossier, nom, () => contenuSauvegarde(store.tous(), maintenant));
    autorisationSignalee = false;
    if (classeur && texteClasseur(classeur)) invite.ecran.journal(texteClasseur(classeur), 'ok');
    invite.ecran.journal(`<span class="dim">sauvegarde automatique · ${esc(nom)}${supprimes.length ? ` · supprimée : ${esc(supprimes.join(', '))}` : ''}</span>`, 'info');
  } catch (e) {
    invite.ecran.journal(`gcblo: sauvegarde automatique impossible : ${esc(e.message)}`, 'err');
  } finally { sauvegardeEnCours = false; }
}

/* 4. Les actions (les commandes sont refaites une par une, voir actions.js). */
const actions = creerActions({
  regles,
  store,
  reglages,
  ecran: invite.ecran,
  confirmer: question => invite.confirmer(question),
  demander: (question, choix) => invite.demander(question, choix),
  // Ouvre l'explorateur de fichiers ; renvoie le fichier choisi, ou null
  choisirFichier: async types => {
    if (!await avantExplorateur()) return null;
    return new Promise(resoudre => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = types;
      input.addEventListener('change', () => { resoudre(input.files[0] || null); invite.focus(); });
      input.addEventListener('cancel', () => { resoudre(null); invite.focus(); });
      input.click();
    });
  },
  // « Enregistrer sous » : l'explorateur de fichiers si le navigateur le permet (Chrome, Edge sur ordinateur), sinon téléchargement
  enregistrerFichier: async (nom, octets, { telecharger = false } = {}) => {
    const xlsm = /\.xlsm$/i.test(nom);
    const type = xlsm ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (window.showSaveFilePicker && !telecharger) {
      if (!await avantExplorateur()) return 'annule';
      try {
        const poignee = await window.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Classeur Excel', accept: { [type]: [xlsm ? '.xlsm' : '.xlsx'] } }] });
        const flux = await poignee.createWritable();
        await flux.write(octets); await flux.close();
        invite.focus();
        return 'enregistre';
      } catch (e) {
        if (e.name === 'AbortError') return 'annule';
        // Autre refus (délai dépassé, navigateur réticent) : on télécharge
      }
    }
    const url = URL.createObjectURL(new Blob([octets], { type }));
    const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'telecharge';
  },
  coffre,
  // Mail prêt : le lien mailto: ouvre la messagerie (Outlook…) avec destinataires, objet et texte
  // « refresh » : les fichiers de l'appli sont redemandés au serveur (pas au cache), puis la page est rechargée.
  // Les dossiers ne bougent pas : ils sont enregistrés dans le navigateur à chaque modification.
  // « sync » : la liste des dossiers part vers l'extension (son script dans cette page) ; true si elle a répondu
  lancerTournee: items => new Promise(resoudre => {
    if (items === null) { postMessage({ registreGcbloTourneeStop: true }, location.origin); return resoudre(true); }
    commencerRecap(items);
    const id = Math.random().toString(36).slice(2);
    const accuse = e => {
      if (e.source !== window || e.data?.registreGcbloTourneeAck !== id) return;
      removeEventListener('message', accuse); clearTimeout(minuteur); resoudre(true);
    };
    addEventListener('message', accuse);
    const minuteur = setTimeout(() => { removeEventListener('message', accuse); resoudre(false); }, 1500);
    postMessage({ registreGcbloTournee: items, id }, location.origin);
  }),
  recharger: async () => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name).filter(u => u.startsWith(location.origin))];
    await Promise.all([...new Set(urls)].map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
    location.reload();
  },
  ouvrirMail: lien => { const a = document.createElement('a'); a.href = lien; a.click(); },
  // Plusieurs fichiers d'un coup (attachements en série) : on choisit un dossier de destination
  // Le dossier est retenu (comme celui des sauvegardes) : choisi une fois, réutilisé sans explorateur ;
  // { changer: true } (« attachement folder ») en choisit un autre
  choisirDossier: async (id, { changer = false } = {}) => {
    if (!window.showDirectoryPicker) return 'telechargement';
    const cle = `dossier-${id}`;
    if (!changer) {
      let connu = null;
      try { connu = await coffre.lire(cle); } catch { /* aucun */ }
      try {
        if (connu?.queryPermission && (await connu.queryPermission({ mode: 'readwrite' }) === 'granted' || await connu.requestPermission({ mode: 'readwrite' }) === 'granted')) return connu;
      } catch { /* refusé, ou dossier disparu : on redemande */ }
    }
    if (!await avantExplorateur()) return null;
    try {
      const d = await window.showDirectoryPicker({ id, mode: 'readwrite' });
      try { await coffre.ecrire(cle, d); } catch { /* le navigateur refuse de retenir le dossier */ }
      invite.focus(); return d;
    } catch (e) { invite.focus(); if (e.name === 'AbortError') return null; throw e; }
  },
  lireDansDossier: async (dossier, nom) => {
    try { return await (await (await dossier.getFileHandle(nom)).getFile()).text(); } catch { return null; }
  },
  ecrireDansDossier: async (dossier, nom, octets) => {
    const fichier = await dossier.getFileHandle(nom, { create: true });
    const flux = await fichier.createWritable();
    await flux.write(octets); await flux.close();
  },
  // Restaurer : l'explorateur s'ouvre dans le dossier des sauvegardes quand le navigateur le permet
  choisirSauvegarde: async () => {
    let dossier = null;
    try { dossier = await coffre.lire('dossier-sauvegarde'); } catch { /* pas de dossier retenu */ }
    if (window.showOpenFilePicker) {
      if (!await avantExplorateur()) return null;
      try {
        const [poignee] = await window.showOpenFilePicker({ id: 'gcblo-restaurer', ...(dossier?.kind === 'directory' ? { startIn: dossier } : {}),
          types: [{ description: 'Sauvegarde GCBLO', accept: { 'application/json': ['.json'] } }] });
        invite.focus();
        return await poignee.getFile();
      } catch (e) {
        invite.focus();
        if (e.name === 'AbortError') return null;
      }
    }
    return new Promise(resoudre => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.addEventListener('change', () => { resoudre(input.files[0] || null); invite.focus(); });
      input.addEventListener('cancel', () => { resoudre(null); invite.focus(); });
      input.click();
    });
  },
  // Sauvegarde : on choisit un dossier (Chrome, Edge), le fichier y est écrit, et seules
  // les 10 sauvegardes les plus récentes y restent. Ailleurs : téléchargement simple.
  // Sauvegarde : on choisit un dossier (Chrome, Edge) ; il est retenu pour les sauvegardes automatiques
  // Le dossier déjà choisi est réutilisé sans rien demander ; « save folder » (changer) en choisit un autre
  sauvegarderDans: async (nom, texte, { changer = false } = {}) => {
    if (!window.showDirectoryPicker) {
      if (typeof texte === 'function') texte = texte();
      const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      noterSauvegarde();
      return { etat: 'telecharge' };
    }
    let dossier = changer ? null : await dossierConnu();
    if (dossier) {
      const { supprimes, classeur } = await ecrireSauvegarde(dossier, nom, texte);
      return { etat: 'enregistre', dossier: dossier.name, supprimes, classeur };
    }
    if (!await avantExplorateur()) return { etat: 'annule' };
    try {
      // « id » : le navigateur rouvre l'explorateur dans le dernier dossier choisi
      dossier = await window.showDirectoryPicker({ id: 'gcblo-sauvegardes', mode: 'readwrite' });
    } catch (e) {
      invite.focus();
      if (e.name === 'AbortError') return { etat: 'annule' };
      throw e;
    }
    const { supprimes, classeur } = await ecrireSauvegarde(dossier, nom, texte);
    try { await coffre.ecrire('dossier-sauvegarde', dossier); } catch { /* le navigateur refuse de retenir le dossier : pas d'automatique */ }
    invite.focus();
    return { etat: 'enregistre', dossier: dossier.name, supprimes, classeur };
  }
});
invite.brancher(analyse => actions.executer(analyse));

/* 5. Le tableau de bord à droite : redessiné à chaque changement, et chaque minute (date, retards). */
const tableauBord = document.getElementById('tableauBord');
const derniereSauvegarde = () => { try { return localStorage.getItem(CLE_DERNIERE_SAUVEGARDE); } catch { return null; } };
/** Valo totale des dossiers liés des GCBLO (tableau de bord), sans les GCBLO annulés ni attachés. */
function valoDesLies() { const l = lireLies(); return Math.round(store.tous().filter(d => !['ANNULE', 'ATTACH'].includes(d.statutDft)).reduce((s, d) => s + (totalLies(d, l) || 0), 0) * 100) / 100; }
/** Nombre de dossiers dont l'affect diffère de la colonne I (tableau de bord). */
function nbEcartsAffect() { const a = lireAffectsClasseur(); return store.tous().filter(d => ecartAffect(d, a)).length; }
function dessinerBord() { tableauBord.innerHTML = `<div class="dessin">${dessinerTableauBord(regles.statistiques(), regles.aujourdhui(), { derniereSauvegarde: derniereSauvegarde(), maintenant: new Date(), ecartsAffect: nbEcartsAffect(), valoLies: valoDesLies(), classeur: lireLocal(CLE_CLASSEUR_LE, null), replies: lireLocal(CLE_REPLIES, []) }).html}</div>`; }
store.ecouter(dessinerBord);

/*
 * registre-gcblo.csv toujours à jour pour la macro Excel : réécrit quelques secondes après chaque
 * changement (FCI, statut…), sans attendre la sauvegarde horaire. Seulement si le navigateur a déjà
 * donné l'accès au dossier des sauvegardes (aucune question posée ici) ; sinon, au prochain « save ».
 */
let minuteurCsv = null;
store.ecouter(() => {
  clearTimeout(minuteurCsv);
  minuteurCsv = setTimeout(async () => {
    try {
      const dossier = await coffre.lire('dossier-sauvegarde');
      if (!dossier?.queryPermission || await dossier.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
      const csv = await dossier.getFileHandle(NOM_CSV, { create: true });
      const flux = await csv.createWritable();
      await flux.write(csvRegistre(store.tous())); await flux.close();
      try { localStorage.setItem('gcblo.v2.csvEcrit', new Date().toISOString()); } catch { /* facultatif */ }
    } catch { /* dossier indisponible : au prochain save */ }
  }, 3000);
});
/*
 * Favori « FCI → registre » (outils/favori-line.js) : depuis une page LINE ouverte par le registre
 * (menu ⋯ › Accès LINE chrome), il envoie directement « fci ‹GCBLO› ‹FCI› ». On n'accepte que ce
 * message-là, et seulement venant de flashback.orange.fr ; la commande passe par la console comme
 * si on l'avait tapée (écho, historique des modifications, cancel).
 */
const ORIGINE_LINE = 'https://flashback.orange.fr';

/** Tournée LINE : une petite barre en bas de l'écran (avancement, dossier en cours, arrêter), puis le bilan. */
let barreTournee = null;
/*
 * R20 — Récapitulatif de la tournée LINE : pendant le sync, chaque mise à jour venue de LINE pour un dossier
 * de la tournée est notée (FCI ajouté, Mis à disposition, commentaire FCI écrit sur LINE) ; à la fin, une
 * fenêtre résume dossier par dossier, avec ceux restés sans réponse. « voir le récap » la rouvre.
 */
let recap = null;           // { debut, fin, items: Map gcblo → { fci: [], mad, commentaire: [], ok } }
function commencerRecap(items) {
  recap = { debut: new Date(), fin: null, items: new Map(items.map(i => [i.gcblo, { fci: [], mad: false, commentaire: [], ok: null }])) };
}
function noterRecap(gcblo, quoi, valeur) {
  const r = recap && !recap.fin && recap.items.get(gcblo);
  if (!r) return;
  if (quoi === 'mad') r.mad = true;
  else r[quoi] = [...new Set([...r[quoi], ...valeur])];
}
let fenetreRecap = null;
function fermerRecap() { fenetreRecap?.remove(); fenetreRecap = null; invite.focus(); }
function afficherRecap() {
  if (!recap) return;
  fermerRecap();
  const lignes = [...recap.items].map(([gcblo, r]) => {
    const faits = [
      ...(r.fci.length ? [`<span class="rc-badge rc-fci">FCI ajouté · ${esc(r.fci.join(' '))}</span>`] : []),
      ...(r.mad ? ['<span class="rc-badge rc-mad">Mis à disposition</span>'] : []),
      ...(r.commentaire.length ? [`<span class="rc-badge rc-com">commentaire LINE · ${esc(r.commentaire.join(' '))}</span>`] : [])
    ];
    const etat = r.ok === false ? '<span class="rc-badge rc-echec">sans réponse</span>' : faits.length ? faits.join('') : '<span class="dim">rien de nouveau</span>';
    return { gcblo, ordre: r.ok === false ? 0 : faits.length ? 1 : 2, html: `<tr><td><button type="button" class="lien c-dossier" data-recap="open ${esc(gcblo)}">${esc(gcblo)}</button></td><td>${etat}</td></tr>` };
  }).sort((a, b) => a.ordre - b.ordre || a.gcblo.localeCompare(b.gcblo));
  const t = [...recap.items.values()];
  const compte = (n, un, plusieurs) => `<span class="rc-total"><b>${n}</b> ${n > 1 ? plusieurs : un}</span>`;
  const duree = recap.fin ? Math.max(1, Math.round((recap.fin - recap.debut) / 60000)) : null;
  fenetreRecap = document.createElement('div');
  fenetreRecap.className = 'recap-fond';
  fenetreRecap.innerHTML = `<div class="recap" role="dialog" aria-label="Récapitulatif de la tournée LINE">
    <div class="recap-tete"><span class="titre">tournée LINE · récapitulatif</span><span class="dim">${recap.debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${duree ? ` · ${duree} min` : ''}</span><button type="button" class="lien recap-fermer" title="fermer (Échap)">✕</button></div>
    <div class="recap-totaux">${compte(t.length, 'dossier vérifié', 'dossiers vérifiés')}${compte(t.filter(r => r.fci.length).length, 'FCI ajouté', 'FCI ajoutés')}${compte(t.filter(r => r.mad).length, 'mis à disposition', 'mis à disposition')}${compte(t.filter(r => r.commentaire.length).length, 'commentaire LINE', 'commentaires LINE')}${t.some(r => r.ok === false) ? compte(t.filter(r => r.ok === false).length, 'sans réponse', 'sans réponse') : ''}</div>
    <div class="recap-corps"><table>${lignes.map(l => l.html).join('')}</table></div>
  </div>`;
  fenetreRecap.addEventListener('click', e => {
    const b = e.target.closest('[data-recap]');
    if (b) { fermerRecap(); invite.lancer(b.dataset.recap); return; }
    if (e.target === fenetreRecap || e.target.closest('.recap-fermer')) fermerRecap();
  });
  fenetreRecap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerRecap(); } });
  document.body.appendChild(fenetreRecap);
  fenetreRecap.querySelector('.recap-fermer').focus();
}
function finirRecap(resultats) {
  if (!recap || recap.fin) return;
  recap.fin = new Date();
  for (const { gcblo, ok } of resultats || []) { const r = recap.items.get(gcblo); if (r) r.ok = ok; }
  // Les dossiers jamais terminés (tournée arrêtée) restent sans état
  afficherRecap();
}

function afficherTournee(p) {
  if (!barreTournee) {
    barreTournee = document.createElement('div');
    barreTournee.className = 'tournee';
    document.body.appendChild(barreTournee);
  }
  clearTimeout(barreTournee.minuteur);
  const pourcent = p.total ? Math.round((p.fait / p.total) * 100) : 100;
  barreTournee.innerHTML = p.fini
    ? `<span class="tournee-titre">tournée LINE terminée</span><span class="dim">${p.fait}/${p.total} vérifiés${p.echecs ? ` · ${p.echecs} sans réponse` : ''}</span>`
      + (recap ? '<button type="button" class="lien c-verbe" data-recap-ouvrir>voir le récap</button>' : '')
    : `<span class="tournee-titre">tournée LINE</span><span>${p.fait}/${p.total}</span><span class="dim">${esc(p.encours || '')}</span>`
      + `<button type="button" class="lien c-verbe" data-commande="sync stop">arrêter</button>`;
  barreTournee.insertAdjacentHTML('beforeend', `<span class="tournee-barre"><span style="width:${pourcent}%"></span></span>`);
  barreTournee.querySelector('[data-recap-ouvrir]')?.addEventListener('click', afficherRecap);
  if (p.fini) {
    finirRecap(p.resultats);
    barreTournee.minuteur = setTimeout(() => { barreTournee?.remove(); barreTournee = null; }, 20000);
  }
}
/*
 * Les commandes venues de LINE (extension, tournée) passent par la file : on peut continuer à se servir
 * du registre pendant un sync. Elles ne vont pas dans l'historique des commandes (flèche du haut), et
 * attendent qu'une question en cours (o/n, choix) ait sa réponse au lieu d'être perdues.
 */
const fileLine = [];
let fileLineActive = false;
async function lancerDepuisLine(commande) {
  fileLine.push(commande);
  if (fileLineActive) return;
  fileLineActive = true;
  try {
    while (fileLine.length) {
      while (invite.occupe()) await new Promise(r => setTimeout(r, 500));
      await invite.lancer(fileLine.shift(), { historique: false });
    }
  } finally { fileLineActive = false; }
}
const COMMANDE_FCI = /^fci ([A-Z]{3}\d{6}-[A-Z]+\d+)((?: F\d{11})+)$/;
const COMMANDE_MAD = /^set ([A-Z]{3}\d{6}-[A-Z]+\d+) to mis-a-dispo$/;
// R16 — l'extension demande les FCI connus d'un GCBLO (pour les écrire en commentaire sur LINE s'ils y manquent),
// puis signale le commentaire ajouté (une ligne dans l'historique du dossier)
const COMMANDE_ASK = /^ask ([A-Z]{3}\d{6}-[A-Z]+\d+)$/;
const COMMANDE_COMMENTE = /^line-commentaire ([A-Z]{3}\d{6}-[A-Z]+\d+)((?: F\d{11})+)$/;
/** Réponse à l'extension : { etat, fci? } (etat : 'maj' | 'deja' | 'inconnu' | 'connu'), ou null si la commande est inconnue. */
function reponseLine(commande) {
  const ask = commande.match(COMMANDE_ASK);
  if (ask) {
    const d = store.tous().find(x => x.gcblo === ask[1]);
    return d ? { etat: 'connu', fci: [...d.fci] } : { etat: 'inconnu' };
  }
  const c = commande.match(COMMANDE_COMMENTE);
  if (c) {
    const d = store.tous().find(x => x.gcblo === c[1]);
    if (!d) return { etat: 'inconnu' };
    regles.noter(d.id, 'line', `FCI écrit en commentaire sur LINE :${c[2]}`);
    noterRecap(d.gcblo, 'commentaire', c[2].trim().split(' '));
    invite.ecran.journal(`<span class="dim">LINE · ${esc(d.gcblo)} : FCI${esc(c[2])} ajouté en commentaire</span>`, 'ok');
    return { etat: 'maj' };
  }
  const etat = fciDepuisLine(commande);
  return etat ? { etat } : null;
}
/**
 * Applique une commande venue de LINE → 'maj' | 'deja' | 'inconnu' (GCBLO absent du registre).
 *  - « fci ‹GCBLO› ‹FCI…› » : FCI ajoutés (rien si déjà connus) ;
 *  - « set ‹GCBLO› to mis-a-dispo » (GCB_1 ‹affaire›_DFT et GCB_2 ‹affaire›_DFT_AUTORISE dans les documents) : seulement depuis un statut
 *    ouvert ; un dossier déjà mis à disposition, attaché ou annulé ne bouge pas.
 */
function fciDepuisLine(commande) {
  const mad = commande.match(COMMANDE_MAD);
  if (mad) {
    const d = store.tous().find(x => x.gcblo === mad[1]);
    if (!d) return 'inconnu';
    if (statutParCode(d.statutDft)?.clos) return 'deja';
    noterRecap(d.gcblo, 'mad');
    lancerDepuisLine(`set ${d.gcblo} to mis-a-dispo`);
    return 'maj';
  }
  const m = commande.match(COMMANDE_FCI);
  if (!m) return null;
  const d = store.tous().find(x => x.gcblo === m[1]);
  if (!d) return 'inconnu';
  const fci = m[2].trim().split(' ');
  if (fci.every(f => d.fci.includes(f))) return 'deja';
  noterRecap(d.gcblo, 'fci', fci.filter(f => !d.fci.includes(f)));
  lancerDepuisLine(`fci ${d.gcblo} ${[...new Set([...d.fci, ...fci])].join(' ')}`);
  return 'maj';
}
addEventListener('message', e => {
  // 1. Le favori, depuis une page LINE ouverte par le registre
  if (e.origin === ORIGINE_LINE) {
    const commande = String(e.data?.registreGcblo || '');
    if (!COMMANDE_FCI.test(commande)) return;
    e.source?.postMessage({ registreGcbloRecu: true }, e.origin);
    fciDepuisLine(commande);
    return;
  }
  // 3. Avancement de la tournée LINE (commande sync)
  if (e.source === window && e.origin === location.origin && e.data?.registreGcbloTourneeProgres) return afficherTournee(e.data.registreGcbloTourneeProgres);
  // 2. L'extension « FCI depuis LINE » (extension/), relayée par son script dans cette page
  if (e.source === window && e.origin === location.origin && typeof e.data?.registreGcbloExtension === 'string') {
    const r = reponseLine(e.data.registreGcbloExtension);
    if (r) postMessage({ registreGcbloEtat: r.etat, fci: r.fci, id: e.data.id }, location.origin);
  }
});
// Un clic sur le titre d'une section la replie ou la rouvre (retenu dans ce navigateur)
tableauBord.addEventListener('click', e => {
  const t = e.target.closest('[data-repli]');
  if (!t) return;
  const replies = lireLocal(CLE_REPLIES, []), titre = t.dataset.repli;
  const suite = replies.includes(titre) ? replies.filter(x => x !== titre) : [...replies, titre];
  try { localStorage.setItem(CLE_REPLIES, JSON.stringify(suite)); } catch { /* facultatif */ }
  dessinerBord();
});
setInterval(() => { dessinerBord(); sauvegardeAutomatique(); lireMailsSiAccesDonne(); }, 60 * 1000);
setTimeout(lireMailsSiAccesDonne, 5000);
dessinerBord();
setTimeout(sauvegardeAutomatique, 3000);   // à l'ouverture, si la dernière date de plus d'une heure

/* 6. Prévenir si l'enregistrement échoue. */
store.ecouter(() => invite.ecran.rafraichirVues());
store.ecouter(e => { if (!e.enregistre) invite.ecran.ligne('gcblo: enregistrement impossible : les dernières modifications ne sont pas gardées', 'err'); });

/* 7. Écran de départ : vide, seulement les avertissements utiles. */
const e = invite.ecran;
if (reprise?.dossiers.length) e.ligne(`${reprise.dossiers.length} dossiers repris de la version 1${reprise.ignores ? ` (${reprise.ignores} ignorés)` : ''}`, 'ok');
if (!stockageOk) e.ligne('gcblo: ce navigateur bloque l\'enregistrement : les données seront perdues à la fermeture', 'err');
invite.rafraichir();
// L'écran « Aujourd'hui » : ce qui demande une action (sans entrer dans l'historique des commandes)
if (store.tous().length) invite.lancer('today', { historique: false });
invite.focus();

// Accès depuis la console du navigateur, pour dépanner : window.gcblo.store.tous()
window.gcblo = { store, regles, esc, coffre, invite };
