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
import { aujourdhui } from './dates.js';
import { convertirV1, lireV1Navigateur } from './reprise-v1.js';
import { creerInvite } from './jarvis/invite.js';
import { creerActions, esc } from './jarvis/actions.js';

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
    // Les commandes utilisées récemment remontent en tête des propositions
    memoriser: id => { const i = recents.indexOf(id); if (i >= 0) recents.splice(i, 1); recents.unshift(id); }
  })
});

/* 4. Les actions (les commandes sont refaites une par une, voir actions.js). */
const actions = creerActions({
  regles,
  store,
  reglages,
  ecran: invite.ecran,
  confirmer: question => invite.confirmer(question),
  demander: (question, choix) => invite.demander(question, choix),
  // Ouvre l'explorateur de fichiers ; renvoie le fichier choisi, ou null
  choisirFichier: types => new Promise(resoudre => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = types;
    input.addEventListener('change', () => resoudre(input.files[0] || null));
    input.addEventListener('cancel', () => resoudre(null));
    input.click();
  }),
  // « Enregistrer sous » : l'explorateur de fichiers si le navigateur le permet (Chrome, Edge sur ordinateur), sinon téléchargement
  enregistrerFichier: async (nom, octets) => {
    const xlsm = /\.xlsm$/i.test(nom);
    const type = xlsm ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (window.showSaveFilePicker) {
      try {
        const poignee = await window.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Classeur Excel', accept: { [type]: [xlsm ? '.xlsm' : '.xlsx'] } }] });
        const flux = await poignee.createWritable();
        await flux.write(octets); await flux.close();
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
  coffre: creerCoffre()
});
invite.brancher(analyse => actions.executer(analyse));

/* 5. Prévenir si l'enregistrement échoue. */
store.ecouter(() => invite.ecran.marquerPerime());
store.ecouter(e => { if (!e.enregistre) invite.ecran.ligne('gcblo: enregistrement impossible : les dernières modifications ne sont pas gardées', 'err'); });

/* 6. Écran de départ : vide, seulement les avertissements utiles. */
const e = invite.ecran;
if (reprise?.dossiers.length) e.ligne(`${reprise.dossiers.length} dossiers repris de la version 1${reprise.ignores ? ` (${reprise.ignores} ignorés)` : ''}`, 'ok');
if (!stockageOk) e.ligne('gcblo: ce navigateur bloque l\'enregistrement : les données seront perdues à la fermeture', 'err');
invite.rafraichir();
invite.focus();

// Accès depuis la console du navigateur, pour dépanner : window.gcblo.store.tous()
window.gcblo = { store, regles, esc };
