/**
 * main.js — le démarrage. Il ne contient aucune règle : il crée les modules
 * et les branche entre eux, dans cet ordre :
 *
 *   store (données)  →  regles (dossiers.js)  →  invite (écran)  →  actions
 *
 * Au premier lancement, si la v1 a laissé des dossiers dans ce navigateur,
 * ils sont repris automatiquement.
 */
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

async function ecrireSauvegarde(dossier, nom, contenu) {
  // D'abord les nouveautés du classeur partagé : la sauvegarde et le CSV les contiennent déjà
  let classeur = null;
  try { classeur = await lireClasseurPartage(dossier); } catch (e) { invite.ecran.journal(`gcblo: ${esc(NOM_CSV_CLASSEUR)} illisible : ${esc(e.message)}`, 'err'); }
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
  recharger: async () => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name).filter(u => u.startsWith(location.origin))];
    await Promise.all([...new Set(urls)].map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
    location.reload();
  },
  ouvrirMail: lien => { const a = document.createElement('a'); a.href = lien; a.click(); },
  // Plusieurs fichiers d'un coup (attachements en série) : on choisit un dossier de destination
  choisirDossier: async id => {
    if (!window.showDirectoryPicker) return 'telechargement';
    if (!await avantExplorateur()) return null;
    try { const d = await window.showDirectoryPicker({ id, mode: 'readwrite' }); invite.focus(); return d; }
    catch (e) { invite.focus(); if (e.name === 'AbortError') return null; throw e; }
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
 * Favori « FCI → registre » (outils/favori-line.js) : depuis une page LINE ouverte par le registre
 * (menu ⋯ › Accès LINE chrome), il envoie directement « fci ‹GCBLO› ‹FCI› ». On n'accepte que ce
 * message-là, et seulement venant de flashback.orange.fr ; la commande passe par la console comme
 * si on l'avait tapée (écho, historique des modifications, cancel).
 */
const ORIGINE_LINE = 'https://flashback.orange.fr';
const COMMANDE_FCI = /^fci ([A-Z]{3}\d{6}-[A-Z]+\d+)((?: F\d{11})+)$/;
const COMMANDE_MAD = /^set ([A-Z]{3}\d{6}-[A-Z]+\d+) to mis-a-dispo$/;
/**
 * Applique une commande venue de LINE → 'maj' | 'deja' | 'inconnu' (GCBLO absent du registre).
 *  - « fci ‹GCBLO› ‹FCI…› » : FCI ajoutés (rien si déjà connus) ;
 *  - « set ‹GCBLO› to mis-a-dispo » (GCB1 et GCB2 dans les documents) : seulement depuis un statut
 *    ouvert ; un dossier déjà mis à disposition, attaché ou annulé ne bouge pas.
 */
function fciDepuisLine(commande) {
  const mad = commande.match(COMMANDE_MAD);
  if (mad) {
    const d = store.tous().find(x => x.gcblo === mad[1]);
    if (!d) return 'inconnu';
    if (statutParCode(d.statutDft)?.clos) return 'deja';
    invite.lancer(`set ${d.gcblo} to mis-a-dispo`);
    return 'maj';
  }
  const m = commande.match(COMMANDE_FCI);
  if (!m) return null;
  const d = store.tous().find(x => x.gcblo === m[1]);
  if (!d) return 'inconnu';
  const fci = m[2].trim().split(' ');
  if (fci.every(f => d.fci.includes(f))) return 'deja';
  invite.lancer(`fci ${d.gcblo} ${[...new Set([...d.fci, ...fci])].join(' ')}`);
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
  // 2. L'extension « FCI depuis LINE » (extension/), relayée par son script dans cette page
  if (e.source === window && e.origin === location.origin && typeof e.data?.registreGcbloExtension === 'string') {
    const etat = fciDepuisLine(e.data.registreGcbloExtension);
    if (etat) postMessage({ registreGcbloEtat: etat, id: e.data.id }, location.origin);
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
setInterval(() => { dessinerBord(); sauvegardeAutomatique(); }, 60 * 1000);
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
