/**
 * sauvegarde.js — le contenu et le nom des sauvegardes (commande « sauvegarde »).
 *
 * Fonctions pures : l'écriture du fichier dans le dossier choisi (explorateur de
 * fichiers) est faite par main.js, qui seul touche au navigateur.
 *
 *   contenuSauvegarde(dossiers, maintenant) → texte JSON (relisible par une future commande de restauration)
 *   nomSauvegarde(maintenant)               → « gcblo-sauvegarde_2026-11-04_09h30-12.json »
 *   aSupprimer(noms, garder = 3)            → les plus anciennes sauvegardes au-delà des `garder` plus récentes
 */
import { STOCKAGE } from './config.js';

export const GARDER = 3;
const MOTIF = /^gcblo-sauvegarde_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}-\d{2}\.json$/;
const deux = n => String(n).padStart(2, '0');

export function nomSauvegarde(d) {
  return `gcblo-sauvegarde_${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}h${deux(d.getMinutes())}-${deux(d.getSeconds())}.json`;
}

export function contenuSauvegarde(dossiers, maintenant) {
  return JSON.stringify({ app: 'Registre GCBLO', version: STOCKAGE.version, sauvegardeLe: maintenant.toISOString(), dossiers }, null, 2);
}

/** Parmi les fichiers d'un dossier, les sauvegardes à supprimer pour n'en garder que les `garder` plus récentes. */
export function aSupprimer(noms, garder = GARDER) {
  // Le nom commence par la date et l'heure : l'ordre alphabétique est l'ordre chronologique
  return noms.filter(n => MOTIF.test(n)).sort().reverse().slice(garder);
}
