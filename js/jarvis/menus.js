/**
 * menus.js — ce que propose le menu « ⋯ » d'un dossier.
 *
 * Règle : un clic = une commande. Chaque choix n'est qu'une commande écrite
 * à l'avance ; le clic la lance dans la console comme si on l'avait tapée.
 *
 * Le menu dépend de l'état du dossier au moment du clic : on ne propose pas
 * de passer en « Refusé » un dossier déjà refusé. « Supprimer » vient toujours en dernier.
 *
 *   optionsDossier(dossier) → [{ libelle, commande, classe? }]
 */
import { STATUTS } from '../config.js';
import { MOTS_STATUT, motPourCode } from './grammaire.js';

export function optionsDossier(d) {
  return [
    { libelle: 'Ouvrir', commande: `open ${d.gcblo}` },
    ...STATUTS.filter(s => s.code !== d.statutDft).map(s => ({
      libelle: `→ ${s.libelle}`,
      commande: `set ${d.gcblo} to ${motPourCode(MOTS_STATUT, s.code)}`,
      classe: `st-${s.code}`
    })),
    { libelle: 'Attachement', commande: `attachement ${d.gcblo}` },
    // Toujours en dernier, en rouge ; la commande demande confirmation
    { libelle: 'Supprimer', commande: `delete ${d.gcblo}`, classe: 'err' }
  ];
}
