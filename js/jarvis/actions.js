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
 *   choisirFichier(types)    → Promise<File|null>  (ouvre l'explorateur de fichiers)
 *   enregistrerFichier(nom, octets) → Promise<'enregistre'|'telecharge'|'annule'>  (explorateur « Enregistrer sous »)
 *   coffre                   fichiers gardés dans le navigateur (la référence d'attachement)
 */
import { criteresListe } from './analyse.js';
import { COMMANDES, SORTES, MOTS_TYPE } from './grammaire.js';
import { IMPORT_EXCEL } from '../config.js';
import { lireClasseur, modifierClasseur, contientMacros } from '../xlsx.js';
import { cellulesAttachement } from '../attachement.js';
import { extraireDossiers } from '../import-excel.js';
import { typeParCode, statutParCode } from '../config.js';

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const SEUIL_CONFIRMATION = 3;
/** Le mot « cancel », cliquable : un clic lance la commande. */
const LIEN_ANNULE = '<button type="button" class="lien c-verbe" data-commande="cancel">cancel</button>';

export function creerActions({ regles, store, reglages, ecran, confirmer, demander, choisirFichier, enregistrerFichier, coffre }) {
  let annulation = null;       // { libelle, faire() } : de quoi défaire la dernière modification

  // Comme les outils Linux : un succès s'écrit simplement, une erreur est préfixée du nom du programme
  const ok = html => ecran.ligne(html, 'ok');
  const erreur = html => ecran.ligne(`gcblo: ${html}`, 'err');
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
      const libelle = v.valeur.statut ? `statut → ${statutParCode(v.valeur.statut).libelle}` : `affect → ${typeParCode(v.valeur.type).libelle}`;
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

    /** R10 — importe les dossiers d'un classeur Excel (onglets et colonnes : IMPORT_EXCEL). */
    async import() {
      const fichier = await choisirFichier('.xlsx,.xlsm');
      if (!fichier) return info('aucun fichier choisi');
      let classeur;
      try { classeur = await lireClasseur(await fichier.arrayBuffer(), { onglets: IMPORT_EXCEL.onglets }); } catch (e) { return erreur(esc(e.message)); }
      const r = extraireDossiers(classeur, store.tous());
      if (r.ongletsAbsents.length === IMPORT_EXCEL.onglets.length) return erreur(`aucun onglet ${IMPORT_EXCEL.onglets.join(', ')} dans ${esc(fichier.name)}`);

      const bilan = [pluriel(r.lus, 'ligne GCBLO', 'lignes GCBLO'), r.nouveaux.length && pluriel(r.nouveaux.length, 'nouveau', 'nouveaux'),
        r.completes.length && `${r.completes.length} à compléter`, r.deja && `${r.deja} déjà à jour`].filter(Boolean);
      info(`${esc(fichier.name)} : ${bilan.join(' · ')}`);
      if (r.ongletsAbsents.length) info(`<span class="dim">onglets absents : ${esc(r.ongletsAbsents.join(', '))}</span>`);
      r.refuses.slice(0, 10).forEach(x => erreur(`onglet ${esc(x.onglet)}, ligne ${x.ligne} : ${esc(x.valeur)} : ${esc(x.motif)}`));
      if (r.refuses.length > 10) erreur(`… et ${r.refuses.length - 10} autres lignes refusées`);
      if (!r.nouveaux.length && !r.completes.length) return info('rien à importer');

      // Type lu en colonne I ; s'il manque ou n'est pas reconnu, il est demandé une fois pour ces dossiers-là
      const sansType = r.nouveaux.filter(n => !n.type);
      let typeParDefaut = null;
      if (sansType.length) {
        const exemples = [...new Set(sansType.map(n => n.typeLu).filter(Boolean))].slice(0, 3);
        if (exemples.length) info(`<span class="dim">affect non reconnu : ${esc(exemples.join(', '))}</span>`);
        const choix = await demander(`affect des ${pluriel(sansType.length, 'dossier', 'dossiers')} sans affect ?`, Object.keys(MOTS_TYPE));
        if (!choix) return info('import abandonné');
        typeParDefaut = MOTS_TYPE[choix];
      }
      const creation = r.nouveaux.length ? regles.creerPlusieurs(r.nouveaux.map(n => ({ gcblo: n.gcblo, type: n.type || typeParDefaut, fci: n.fci, commune: n.commune, valorisation: n.valorisation })), { origine: 'import Excel' }) : { crees: [], refuses: [] };
      const avant = [];
      for (const c of r.completes) {
        const m = regles.modifier(c.dossier.id, c.changements);
        if (m.ok && m.avant) avant.push(m.avant);
      }
      if (creation.crees.length || avant.length) {
        const ids = creation.crees.map(d => d.id);
        annulation = { libelle: 'import', faire: () => { if (ids.length) regles.supprimer(...ids); if (avant.length) regles.restaurer(avant); } };
      }
      creation.refuses.forEach(x => erreur(`${esc(x.saisie.gcblo)} : ${esc(x.erreur)}`));
      ok(`${pluriel(creation.crees.length, 'dossier créé', 'dossiers créés')}${avant.length ? ` · ${pluriel(avant.length, 'complété', 'complétés')}` : ''} <span class="dim">·</span> ${LIEN_ANNULE}`);
    },

    /** R11 — « attachement fichier » choisit la référence ; « attachement ‹dossier› » crée l'attachement. */
    async attachement(v) {
      if (v.cible.fichier) {
        const fichier = await choisirFichier('.xlsx,.xlsm');
        if (!fichier) return info('aucun fichier choisi');
        const octets = new Uint8Array(await fichier.arrayBuffer());
        try { await lireClasseur(octets, { onglets: [] }); } catch (e) { return erreur(esc(e.message)); }
        await coffre.ecrire('attachement-reference', { nom: fichier.name, octets, le: new Date().toISOString() });
        return ok(`référence : ${esc(fichier.name)}`);
      }
      const ref = await coffre.lire('attachement-reference');
      if (!ref) return erreur('aucune référence · attachement fichier');
      const d = store.parId(v.cible.dossier.id) || v.cible.dossier;
      const { cellules, palier, avertissements } = cellulesAttachement(d, regles.aujourdhui());
      avertissements.forEach(a => info(`<span class="dim">${esc(a)}</span>`));
      let octets;
      try { octets = await modifierClasseur(ref.octets, { cellules }); } catch (e) { return erreur(esc(e.message)); }
      // Avec macros, le fichier doit s'appeler .xlsm, sinon Excel refuse de l'ouvrir
      const nom = `${d.gcblo}.${contientMacros(ref.octets) ? 'xlsm' : 'xlsx'}`;
      const r = await enregistrerFichier(nom, octets);
      if (r === 'annule') return info('non enregistré');
      regles.noterAttachement(d.id, palier?.nom);
      ok(`${esc(nom)} ${r === 'telecharge' ? 'téléchargé' : 'enregistré'}${palier ? ` <span class="dim">· ${esc(palier.nom)}</span>` : ''}`);
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
