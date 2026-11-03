/**
 * attachement.js — R11 : quelles cellules remplir dans l'attachement d'un dossier.
 *
 * Fonction pure : elle ne lit ni n'écrit aucun fichier. La commande « attachement »
 * passe ces cellules à xlsx.js (modifierClasseur) sur une copie de la référence.
 *
 *   cellulesAttachement(dossier, jour) → {
 *     cellules: { X5: commune, AG5: { date: jour }, U6: gcblo, A30: 'ANNEX', AB30: 1, … },
 *     palier:   { cible, nom } | null,
 *     avertissements: ['…']           ce qui n'a pas pu être rempli
 *   }
 * Réglages (cellules, paliers, écart toléré) : ATTACHEMENT dans config.js.
 */
import { ATTACHEMENT } from './config.js';
import { formaterMontant } from './dossiers.js';

/** Le palier le plus proche de la valorisation, s'il est assez proche ; sinon null. */
export function palierPour(valorisation, reglages = ATTACHEMENT) {
  if (valorisation === null || valorisation === undefined || Number.isNaN(valorisation)) return null;
  const tries = [...reglages.paliers].sort((a, b) => Math.abs(valorisation - a.cible) - Math.abs(valorisation - b.cible));
  return Math.abs(valorisation - tries[0].cible) <= reglages.ecartMax ? tries[0] : null;
}

export function cellulesAttachement(dossier, jour, reglages = ATTACHEMENT) {
  const c = reglages.cellules;
  const cellules = { [c.date]: { date: jour }, [c.gcblo]: dossier.gcblo };
  const avertissements = [];
  if (dossier.commune) cellules[c.commune] = dossier.commune;
  else avertissements.push(`commune vide : ${c.commune} non rempli`);

  const v = dossier.valorisation ?? null;
  const palier = palierPour(v, reglages);
  if (palier) Object.assign(cellules, palier.cellules);
  else if (v === null) avertissements.push('valorisation vide : aucun palier coché');
  else avertissements.push(`valorisation ${formaterMontant(v)} : ni proche de ${reglages.paliers.map(p => p.cible).join(' ni de ')}, aucun palier coché`);
  return { cellules, palier: palier ? { cible: palier.cible, nom: palier.nom } : null, avertissements };
}
