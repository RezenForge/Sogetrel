/**
 * actions.js — exécute une commande comprise (analyse complète).
 *
 * Il ne modifie jamais les données lui-même : il appelle les règles de
 * dossiers.js, puis écrit le résultat à l'écran. Il garde de quoi annuler
 * la dernière modification (commande « annule »).
 *
 * Ce dont il a besoin lui est donné à la création (rien n'est caché) :
 *   regles, store            les données et leurs règles
 *   ecran                    { ligne(html, classe), tableau(dossiers), fiche(dossier), vider() }
 *   confirmer(question)      → Promise<boolean>  (l'invite pose la question o/n)
 *   ouvrirLien(url)          ouvre l'email (mailto:)
 *   telecharger(nom, texte)  propose un fichier à enregistrer
 *   choisirFichier()         → Promise<File|null>
 */
import { COMMANDES, SORTES } from './grammaire.js';
import { criteresListe } from './analyse.js';
import { TYPES, STATUTS, STOCKAGE, typeParCode, statutParCode } from '../config.js';
import { formater } from '../dates.js';
import { convertirV1, estFormatV1 } from '../reprise-v1.js';

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const SEUIL_CONFIRMATION = 3;

export function creerActions({ regles, store, ecran, confirmer, ouvrirLien, telecharger, choisirFichier }) {
  let annulation = null;       // { libelle, faire() } : de quoi défaire la dernière modification

  const ok = html => ecran.ligne(`✓ ${html}`, 'ok');
  const erreur = html => ecran.ligne(`✗ ${html}`, 'err');
  const info = html => ecran.ligne(html, 'info');
  const premiereErreur = r => Object.values(r.erreurs || {})[0] || 'action refusée';

  const commandes = {
    ls(v) {
      const liste = regles.trier(regles.filtrer(criteresListe(v)), { cle: 'dateAffectation', sens: 'desc' });
      if (!liste.length) return info('aucun dossier ne correspond');
      ecran.tableau(liste);
      info(pluriel(liste.length, 'dossier', 'dossiers'));
    },

    ajoute(v) {
      const r = regles.creer({ type: v.type, gcblo: v.gcblo, fci: v.fci || [] });
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      annulation = { libelle: `la création de ${r.dossier.gcblo}`, faire: () => regles.supprimer(r.dossier.id) };
      ok(`${esc(r.dossier.gcblo)} créé (${esc(typeParCode(r.dossier.type).libelle)})`);
    },

    async passe(v) {
      const champ = v.valeur.statut ? { statutDft: v.valeur.statut } : { type: v.valeur.type };
      const libelle = v.valeur.statut ? `statut → ${statutParCode(v.valeur.statut).libelle}` : `type → ${typeParCode(v.valeur.type).libelle}`;
      if (v.cibles.length > SEUIL_CONFIRMATION && !(await confirmer(`modifier ${v.cibles.length} dossiers (${libelle}) ?`))) return info('rien n\'a été modifié');
      const r = regles.modifierPlusieurs(v.cibles.map(d => d.id), champ);
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      if (r.modifies) annulation = { libelle: `la modification de ${pluriel(r.modifies, 'dossier', 'dossiers')}`, faire: () => regles.restaurer(r.avant) };
      ok(`${v.cibles.length === 1 ? esc(v.cibles[0].gcblo) : pluriel(r.modifies, 'dossier modifié', 'dossiers modifiés')} : ${esc(libelle)}${r.inchanges ? ` (${r.inchanges} déjà à jour)` : ''}`);
    },

    relance(v) {
      const d = v.cible;
      if (v.date) {
        const r = regles.modifier(d.id, { dateRelance: v.date });
        if (!r.ok) return erreur(esc(premiereErreur(r)));
        if (r.avant) annulation = { libelle: `la date de relance de ${d.gcblo}`, faire: () => regles.restaurer([r.avant]) };
        return ok(`relance de ${esc(d.gcblo)} prévue le ${formater(v.date)}`);
      }
      const { objet, corps } = regles.email(d);
      ouvrirLien(`mailto:?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps.replace(/\n/g, '\r\n'))}`);
      regles.noterRelance(d.id);
      ok(`email de relance préparé pour ${esc(d.gcblo)}`);
      info(`astuce : <span class="c-verbe">relance</span> <span class="c-dossier">${esc(d.gcblo)}</span> <span class="c-valeur">+7</span> pour planifier la suivante`);
    },

    fci(v) {
      const r = regles.modifier(v.cible.id, { fci: [...v.cible.fci, ...v.fci] });
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      if (r.avant) annulation = { libelle: `l'ajout de FCI à ${v.cible.gcblo}`, faire: () => regles.restaurer([r.avant]) };
      ok(`${esc(v.cible.gcblo)} : FCI ${esc(r.dossier.fci.join(', '))}`);
    },

    note(v) {
      const d = v.cible;
      const r = regles.modifier(d.id, { commentaire: d.commentaire ? `${d.commentaire}\n${v.texte}` : v.texte });
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      if (r.avant) annulation = { libelle: `la note sur ${d.gcblo}`, faire: () => regles.restaurer([r.avant]) };
      ok(`note ajoutée à ${esc(d.gcblo)}`);
    },

    ouvre(v) { ecran.fiche(v.cible); },

    async supprime(v) {
      const noms = v.cibles.map(d => d.gcblo);
      const question = v.cibles.length === 1 ? `supprimer ${noms[0]} ?` : `supprimer ${v.cibles.length} dossiers (${noms.slice(0, 3).join(', ')}${noms.length > 3 ? '…' : ''}) ?`;
      if (!(await confirmer(question))) return info('rien n\'a été supprimé');
      const r = regles.supprimer(...v.cibles.map(d => d.id));
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      annulation = { libelle: `la suppression de ${pluriel(r.retires.length, 'dossier', 'dossiers')}`, faire: () => regles.restaurer(r.retires) };
      ok(`${pluriel(r.retires.length, 'dossier supprimé', 'dossiers supprimés')} · tapez <span class="c-verbe">annule</span> pour revenir en arrière`);
    },

    stats() {
      const s = regles.statistiques();
      const ligne = (libelle, n, classe = '') => `<span class="dim">${esc(libelle.padEnd(24, '.'))}</span> <span class="${classe}">${n}</span>`;
      info(`<b>${pluriel(s.total, 'dossier', 'dossiers')}</b>`);
      TYPES.forEach(t => info(ligne(t.libelle, s.parType[t.code], `ty-${t.code}`)));
      STATUTS.forEach(st => info(ligne(st.libelle, s.parStatut[st.code], `st-${st.code}`)));
      info(ligne('Relances en retard', s.retard, s.retard ? 'retard' : ''));
      info(ligne('Relances proches', s.proche, s.proche ? 'proche' : ''));
      info(ligne('Sans FCI', s.sansFci));
    },

    annule() {
      if (!annulation) return info('il n\'y a rien à annuler');
      const a = annulation; annulation = null;
      a.faire();
      ok(`j'ai annulé ${esc(a.libelle)}`);
    },

    sauvegarde() {
      const jour = new Date().toISOString().slice(0, 10);
      telecharger(`sauvegarde-gcblo_${jour}.json`, JSON.stringify({ app: 'Registre GCBLO', version: STOCKAGE.version, exporteLe: new Date().toISOString(), dossiers: store.tous() }, null, 2));
      ok(`sauvegarde de ${pluriel(store.tous().length, 'dossier', 'dossiers')} téléchargée`);
    },

    async restaure() {
      const fichier = await choisirFichier();
      if (!fichier) return info('aucun fichier choisi');
      let donnees;
      try { donnees = JSON.parse(await fichier.text()); } catch { return erreur('ce fichier n\'est pas une sauvegarde JSON lisible'); }
      const { dossiers, ignores } = estFormatV1(donnees) ? convertirV1(donnees) : { dossiers: donnees?.dossiers || [], ignores: 0 };
      if (!dossiers.length) return erreur('aucun dossier trouvé dans ce fichier');
      if (!(await confirmer(`remplacer les ${store.tous().length} dossiers actuels par les ${dossiers.length} de la sauvegarde ?`))) return info('rien n\'a été modifié');
      const avant = store.tous();
      store.remplacerTout(dossiers);
      annulation = { libelle: 'la restauration', faire: () => store.remplacerTout(avant) };
      ok(`${pluriel(dossiers.length, 'dossier restauré', 'dossiers restaurés')}${ignores ? ` (${ignores} ignorés : illisibles ou en double)` : ''}`);
    },

    clear() { ecran.vider(); },

    aide(v) {
      if (v.sujet) {
        const c = v.sujet;
        info(`<span class="c-verbe">${esc(c.forme)}</span>`);
        info(`<span class="dim">${esc(c.resume)}</span>`);
        c.emplacements.filter(e => !e.mot).forEach(e => info(`  ${esc(e.nom)} : ${esc(SORTES[e.sorte])}${e.optionnel ? ' (facultatif)' : ''}`));
        if (c.verbes.length > 1) info(`<span class="dim">  autres noms : ${esc(c.verbes.slice(1).join(', '))}</span>`);
        return;
      }
      COMMANDES.forEach(c => info(`<span class="c-verbe">${esc(c.verbes[0].padEnd(11))}</span><span class="dim">${esc(c.resume)}</span>`));
      info('<span class="dim">Tab ou → accepte la proposition · ↑ ↓ parcourent · Entrée exécute · Échap ferme</span>');
    }
  };

  return {
    /** Exécute une analyse complète. */
    async executer(analyse) {
      const fn = commandes[analyse.commande.id];
      if (!fn) return erreur(`commande non disponible : ${esc(analyse.commande.id)}`);
      try { await fn(analyse.valeurs); } catch (e) { console.error(e); erreur('une erreur inattendue s\'est produite'); }
    }
  };
}
