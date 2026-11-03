/**
 * actions.js — exécute une commande comprise (analyse complète).
 *
 * Une fonction par commande de grammaire.js, sous le même id. Elle reçoit les
 * valeurs lues (v.cibles, v.valeur…) et passe par les règles (dossiers.js)
 * pour toute modification, jamais directement par le store.
 *
 * Les clics de l'écran (GCBLO, menu ⋯, « cancel », aide) passent eux aussi par ici :
 * un clic écrit une commande dans la console et la lance (voir FONDATION §5).
 *
 * Ce dont les commandes ont besoin leur est donné à la création :
 *   regles, store            les données et leurs règles
 *   reglages                 réglages (destinataires des emails…)
 *   ecran                    { ligne(html, classe), tableau(dossiers), fiche(dossier), vider() }
 *   confirmer(question)      → Promise<boolean>  (l'invite pose la question o/n)
 *   demander(question, choix) → Promise<choix|null>
 */
import { criteresListe } from './analyse.js';
import { COMMANDES, SORTES } from './grammaire.js';
import { typeParCode, statutParCode } from '../config.js';

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const SEUIL_CONFIRMATION = 3;
/** Le mot « cancel », cliquable : un clic lance la commande. */
const LIEN_ANNULE = '<button type="button" class="lien c-verbe" data-commande="cancel">cancel</button>';

export function creerActions({ regles, store, reglages, ecran, confirmer, demander }) {
  let annulation = null;       // { libelle, faire() } : de quoi défaire la dernière modification

  const ok = html => ecran.ligne(`✓ ${html}`, 'ok');
  const erreur = html => ecran.ligne(`✗ ${html}`, 'err');
  const info = html => ecran.ligne(html, 'info');
  const premiereErreur = r => Object.values(r.erreurs || {})[0] || 'action refusée';

  const commandes = {
    ls(v) {
      const liste = regles.trier(regles.filtrer(criteresListe(v)), { cle: 'dateAffectation', sens: 'desc' });
      if (!liste.length) return info(store.tous().length ? 'aucun dossier ne correspond' : 'aucun dossier enregistré');
      ecran.tableau(liste);
      info(`<span class="dim">${pluriel(liste.length, 'dossier', 'dossiers')}</span>`);
    },

    open(v) { ecran.fiche(store.parId(v.cible.id) || v.cible); },

    async set(v) {
      const champ = v.valeur.statut ? { statutDft: v.valeur.statut } : { type: v.valeur.type };
      const libelle = v.valeur.statut ? `statut → ${statutParCode(v.valeur.statut).libelle}` : `type → ${typeParCode(v.valeur.type).libelle}`;
      if (v.cibles.length > SEUIL_CONFIRMATION && !(await confirmer(`modifier ${v.cibles.length} dossiers (${libelle}) ?`))) return info('rien de modifié');
      const r = regles.modifierPlusieurs(v.cibles.map(d => d.id), champ);
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      if (!r.modifies) return info(`${v.cibles.length === 1 ? esc(v.cibles[0].gcblo) + ' est' : 'ces dossiers sont'} déjà à jour`);
      annulation = { libelle: pluriel(r.modifies, 'modification', 'modifications'), faire: () => regles.restaurer(r.avant) };
      ok(`${v.cibles.length === 1 ? esc(v.cibles[0].gcblo) : pluriel(r.modifies, 'dossier modifié', 'dossiers modifiés')} : ${esc(libelle)}${r.inchanges ? ` (${r.inchanges} déjà à jour)` : ''} <span class="dim">·</span> ${LIEN_ANNULE}`);
    },

    async delete(v) {
      const noms = v.cibles.map(d => d.gcblo);
      const question = v.cibles.length === 1 ? `supprimer ${noms[0]} ?` : `supprimer ${v.cibles.length} dossiers (${noms.slice(0, 3).join(', ')}${noms.length > 3 ? '…' : ''}) ?`;
      if (!(await confirmer(question))) return info('rien de supprimé');
      const r = regles.supprimer(...v.cibles.map(d => d.id));
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      annulation = { libelle: pluriel(r.retires.length, 'suppression', 'suppressions'), faire: () => regles.restaurer(r.retires) };
      ok(`${pluriel(r.retires.length, 'dossier supprimé', 'dossiers supprimés')} <span class="dim">·</span> ${LIEN_ANNULE}`);
    },

    cancel() {
      if (!annulation) return info('rien à annuler');
      const a = annulation; annulation = null;
      a.faire();
      ok(`annulé : ${esc(a.libelle)}`);
    },

    clear() { ecran.vider(); },

    /** Sans sujet : la liste des commandes (cliquables) ; avec un sujet : le détail d'une commande. */
    help(v) {
      if (v.sujet) {
        const c = v.sujet;
        info(`<span class="c-verbe">${esc(c.forme)}</span>`);
        c.emplacements.filter(e => !e.mot).forEach(e => info(`<span class="dim">  ${esc(e.nom)} : ${esc(SORTES[e.sorte])}</span>`));
        return;
      }
      COMMANDES.forEach(c => info(`<button type="button" class="lien c-verbe" data-commande="help ${esc(c.verbes[0])}">${esc(c.verbes[0])}</button>${' '.repeat(Math.max(1, 8 - c.verbes[0].length))}<span class="dim">${esc(c.resume)}</span>`));
    }
  };

  return {
    /** Exécute une analyse complète. */
    async executer(analyse) {
      const fn = commandes[analyse.commande.id];
      if (!fn) return erreur(`commande non disponible : ${esc(analyse.commande.id)}`);
      try { await fn(analyse.valeurs); } catch (e) { console.error(e); erreur('erreur inattendue'); }
    }
  };
}
