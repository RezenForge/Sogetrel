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
import { creerMeteo } from './meteo.js';
import { creerWiki } from './wiki.js';
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

/* 4. Les actions, avec ce dont elles ont besoin. */
const actions = creerActions({
  regles,
  store,
  reglages,
  meteo: creerMeteo(),
  wiki: creerWiki(),
  ecran: invite.ecran,
  confirmer: question => invite.confirmer(question),
  demander: (question, choix) => invite.demander(question, choix),
  ouvrirLien: url => { const a = document.createElement('a'); a.href = url; a.click(); },
  telecharger: (nom, texte) => {
    const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  choisirFichier: () => new Promise(resoudre => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => resoudre(input.files[0] || null));
    input.addEventListener('cancel', () => resoudre(null));
    input.click();
  })
});
invite.brancher(analyse => actions.executer(analyse));
invite.brancherCollage(texte => actions.collage(texte));

/* 5. Prévenir si l'enregistrement échoue. */
store.ecouter(e => { if (!e.enregistre) invite.ecran.ligne('✗ enregistrement impossible : faites une « sauvegarde » pour ne rien perdre', 'err'); });

/* 6. Accueil. */
const e = invite.ecran;
e.ligne('<b>Registre GCBLO</b> <span class="dim">v2 · terminal</span>', 'titre');
if (reprise?.dossiers.length) e.ligne(`✓ ${reprise.dossiers.length} dossiers repris de la version 1${reprise.ignores ? ` (${reprise.ignores} ignorés)` : ''}`, 'ok');
if (!stockageOk) e.ligne('✗ ce navigateur bloque l\'enregistrement : les données seront perdues à la fermeture', 'err');
e.ligne(`<span class="dim">${store.tous().length} dossiers · commencez à taper, les propositions suivent (Tab sur une ligne vide : toutes les commandes) · <span class="c-verbe">aide</span> · collez une liste copiée d'Excel pour l'ajouter</span>`, 'info');
e.ligne('', 'info');
actions.point();
invite.rafraichir();
invite.focus();

// Accès depuis la console du navigateur, pour dépanner : window.gcblo.store.tous()
window.gcblo = { store, regles, esc };
