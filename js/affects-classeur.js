/**
 * affects-classeur.js — l'affect écrit en colonne I du classeur partagé, pour repérer les écarts
 * avec le registre. Rien n'est corrigé automatiquement : `ls ecart-affect` montre les écarts,
 * on corrige à la main (double-clic sur la case affect).
 *
 * À chaque import (commande `import`, ou classeur-gcblo.csv à la sauvegarde), on retient pour
 * chaque GCBLO le texte de la colonne I (plusieurs lignes : toutes les valeurs différentes).
 * Gardé dans ce navigateur (localStorage), à part des dossiers : pas d'historique, pas de sauvegarde.
 *
 *   lireAffectsClasseur()             → { gcblo: ['AIR', …] }
 *   noterAffectsClasseur(affects)     fusionne (les GCBLO lus remplacent les anciens)
 *   ecartAffect(dossier, affects)     → { classeur: ['NUM21'] } si la colonne I dit autre chose, sinon null
 */
import { lireType } from './import-excel.js';

const CLE = 'gcblo.v2.affectsClasseur';

export function lireAffectsClasseur() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}

export function noterAffectsClasseur(affects) {
  if (!affects || !Object.keys(affects).length) return;
  try { localStorage.setItem(CLE, JSON.stringify({ ...lireAffectsClasseur(), ...affects })); } catch { /* facultatif */ }
}

/**
 * Écart : la colonne I contient un affect reconnu (NUM21, AIR, Sogetrel) différent de celui du registre,
 * ou plusieurs lignes du classeur ne disent pas la même chose. Colonne I vide ou autre entreprise
 * (non reconnue) : pas d'écart si le registre n'a pas d'affect non plus.
 */
export function ecartAffect(d, affects) {
  const bruts = (affects[d.gcblo] || []).filter(Boolean);
  if (!bruts.length) return null;
  const codes = [...new Set(bruts.map(lireType))];
  if (codes.length === 1 && codes[0] === (d.type || null)) return null;
  if (codes.length === 1 && codes[0] === null && !d.type) return null;
  return { classeur: bruts };
}
