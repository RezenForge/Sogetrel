/**
 * store.js — l'endroit où les dossiers sont gardés.
 *
 * Rôle unique : garder la liste des dossiers, l'enregistrer, et prévenir
 * l'interface quand quelque chose change. Le store ne connaît AUCUNE règle
 * métier : il ne vérifie rien. C'est dossiers.js qui décide ce qui est permis,
 * puis qui demande au store d'enregistrer (voir « la règle d'or » de la fondation).
 *
 * Deux choix importants :
 *  - Les dossiers sont « gelés » (Object.freeze) : on ne les modifie jamais
 *    sur place, on les remplace par une nouvelle version. L'interface peut
 *    ainsi savoir qu'une ligne a changé en comparant simplement les objets.
 *  - Le support d'enregistrement est interchangeable : le navigateur en temps
 *    normal, la mémoire pour les tests, et plus tard SharePoint par exemple.
 */
import { STOCKAGE } from './config.js';

/* ---------------- Supports d'enregistrement ---------------- */

/** Enregistre dans le navigateur (localStorage). Ne plante jamais : en cas d'échec, `ecrire` renvoie false. */
export function supportNavigateur(cle = STOCKAGE.cle) {
  return {
    lire() {
      try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; }
    },
    ecrire(donnees) {
      try { localStorage.setItem(cle, JSON.stringify(donnees)); return true; } catch { return false; }
    }
  };
}

/** Enregistre en mémoire seulement (tests, ou navigateur qui bloque le stockage). */
export function supportMemoire(depart = null) {
  let donnees = depart;
  return {
    lire: () => (donnees ? JSON.parse(JSON.stringify(donnees)) : null),
    ecrire: d => { donnees = JSON.parse(JSON.stringify(d)); return true; }
  };
}

/* ---------------- Le store ---------------- */

/** Gèle un dossier et ses listes internes (fci, historique). */
function geler(dossier) {
  return Object.freeze({
    ...dossier,
    fci: Object.freeze([...dossier.fci]),
    historique: Object.freeze(dossier.historique.map(e => Object.freeze({ ...e })))
  });
}

/**
 * Crée un store sur le support donné.
 *
 * Les événements envoyés aux abonnés ont cette forme :
 *   { type: 'ajout' | 'modification' | 'suppression' | 'remplacement', ids: [...], enregistre: bool }
 * `enregistre: false` signale que l'écriture a échoué (stockage plein ou bloqué).
 */
export function creerStore(support = supportNavigateur()) {
  const brut = support.lire();
  let dossiers = Array.isArray(brut?.dossiers) ? brut.dossiers.map(geler) : [];
  const abonnes = new Set();

  function enregistrer(type, ids) {
    const enregistre = support.ecrire({ version: STOCKAGE.version, dossiers });
    const evenement = { type, ids, enregistre };
    abonnes.forEach(fn => fn(evenement));
  }

  return {
    /** Tous les dossiers (liste gelée : on ne la modifie pas). */
    tous: () => dossiers,
    parId: id => dossiers.find(d => d.id === id) || null,
    parGcblo: gcblo => dossiers.find(d => d.gcblo === gcblo) || null,

    /** Ajoute un ou plusieurs dossiers, en un seul enregistrement. */
    ajouter(...nouveaux) {
      dossiers = Object.freeze([...dossiers, ...nouveaux.map(geler)]);
      enregistrer('ajout', nouveaux.map(d => d.id));
    },

    /** Remplace un ou plusieurs dossiers par leur nouvelle version (même id). */
    remplacer(...nouveaux) {
      const parId = new Map(nouveaux.map(d => [d.id, geler(d)]));
      dossiers = Object.freeze(dossiers.map(d => parId.get(d.id) || d));
      enregistrer('modification', [...parId.keys()]);
    },

    retirer(...ids) {
      const aRetirer = new Set(ids);
      dossiers = Object.freeze(dossiers.filter(d => !aRetirer.has(d.id)));
      enregistrer('suppression', ids);
    },

    /** Remplace toute la liste (restauration d'une sauvegarde). */
    remplacerTout(liste) {
      dossiers = Object.freeze(liste.map(geler));
      enregistrer('remplacement', dossiers.map(d => d.id));
    },

    /** S'abonne aux changements. Renvoie une fonction pour se désabonner. */
    ecouter(fn) {
      abonnes.add(fn);
      return () => abonnes.delete(fn);
    }
  };
}
