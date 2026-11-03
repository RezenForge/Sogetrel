/**
 * actions.js — exécute une commande comprise (analyse complète).
 *
 * Les commandes ont été retirées le 03/11/2026 pour être refaites une par une
 * (l'ancienne version est gardée dans la branche « v2-commandes »).
 *
 * Pour ajouter une commande :
 *   1. la décrire dans grammaire.js (verbes, emplacements) : elle est alors
 *      comprise et proposée pendant la frappe ;
 *   2. écrire ici la fonction du même id dans `commandes`. Elle reçoit les
 *      valeurs lues (v.cibles, v.date…) et passe par les règles (dossiers.js)
 *      pour toute modification, jamais directement par le store.
 *
 * Ce dont les commandes ont besoin leur est donné à la création :
 *   regles, store            les données et leurs règles
 *   reglages                 réglages (destinataires des emails…)
 *   ecran                    { ligne(html, classe), tableau(dossiers), fiche(dossier), vider() }
 *   confirmer(question)      → Promise<boolean>  (l'invite pose la question o/n)
 *   demander(question, choix) → Promise<choix|null>
 */

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function creerActions({ regles, store, reglages, ecran, confirmer, demander }) {
  const erreur = html => ecran.ligne(`✗ ${html}`, 'err');

  /** Une fonction par commande de grammaire.js, sous le même id. */
  const commandes = {};

  return {
    /** Exécute une analyse complète. */
    async executer(analyse) {
      const fn = commandes[analyse.commande.id];
      if (!fn) return erreur(`commande non disponible : ${esc(analyse.commande.id)}`);
      try { await fn(analyse.valeurs); } catch (e) { console.error(e); erreur('une erreur inattendue s\'est produite'); }
    }
  };
}
