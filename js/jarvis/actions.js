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
 *   sauvegarderDans(nom, texte, { changer }) → Promise<{ etat: 'enregistre'|'telecharge'|'annule', dossier?, supprimes? }>
 *   choisirSauvegarde()      → Promise<File|null>  (explorateur, ouvert si possible dans le dossier des sauvegardes)
 *   choisirDossier(id)       → Promise<dossier|'telechargement'|null>  (explorateur de dossiers ; null = abandon)
 *   ecrireDansDossier(dossier, nom, octets) → Promise  (écrit ou remplace un fichier dans ce dossier)
 *   ouvrirMail(lien)         ouvre un lien mailto: dans la messagerie
 */
import { criteresListe, resultatLs } from './analyse.js';
import { COMMANDES, SORTES, MOTS_TYPE, MOTS_STATUT, CHAMPS, plat } from './grammaire.js';
import { lireDate } from './analyse.js';
import { IMPORT_EXCEL } from '../config.js';
import { lireClasseur, modifierClasseur, contientMacros } from '../xlsx.js';
import { cellulesAttachement } from '../attachement.js';
import { mailAffectation, mailRelance, lienMailto, AFFECTS_MAIL } from '../mails.js';
import { contenuSauvegarde, nomSauvegarde, lireSauvegarde, GARDER } from '../sauvegarde.js';
import { extraireDossiers, appliquerImport } from '../import-excel.js';
import { lireAffectsClasseur, noterAffectsClasseur, ecartAffect } from '../affects-classeur.js';
import { typeParCode, statutParCode } from '../config.js';
import { pointDuJour } from './aujourdhui.js';
import { depuisJour } from '../dates.js';

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const SEUIL_CONFIRMATION = 3;
/** Le mot « cancel », cliquable : un clic lance la commande. */
const LIEN_ANNULE = '<button type="button" class="lien c-verbe" data-commande="cancel">cancel</button>';

/**
 * R14 — bilan de la lecture de classeur-gcblo.csv (écrit par la macro du classeur partagé).
 * c = { lus, crees: [gcblo], completes, refuses, le (date du fichier) } ; complet : dire aussi « rien de nouveau ».
 */
export function texteClasseur(c, complet = false) {
  const quand = c.le ? ` (macro du ${new Date(c.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})` : '';
  if (!c.crees.length && !c.completes) return complet ? `<span class="dim">classeur partagé${esc(quand)} : rien de nouveau</span>` : '';
  const morceaux = [c.crees.length && pluriel(c.crees.length, 'nouveau GCBLO', 'nouveaux GCBLO'), c.completes && pluriel(c.completes, 'dossier complété', 'dossiers complétés')].filter(Boolean);
  const exemples = c.crees.slice(0, 5).join(', ') + (c.crees.length > 5 ? '…' : '');
  return `classeur partagé${esc(quand)} : ${morceaux.join(' · ')}${exemples ? ` <span class="dim">· ${esc(exemples)}</span>` : ''}`;
}

export function creerActions({ regles, store, reglages, ecran, confirmer, demander, choisirFichier, enregistrerFichier, coffre, sauvegarderDans, choisirSauvegarde, choisirDossier, ecrireDansDossier, ouvrirMail = () => {}, recharger = () => location.reload() }) {
  let annulation = null;       // { libelle, faire() } : de quoi défaire la dernière modification

  // Comme les outils Linux : un succès s'écrit simplement, une erreur est préfixée du nom du programme
  const ok = html => ecran.ligne(html, 'ok');
  const erreur = html => ecran.ligne(`gcblo: ${html}`, 'err');
  const info = html => ecran.ligne(html, 'info');
  const premiereErreur = r => Object.values(r.erreurs || {})[0] || 'action refusée';

  const commandes = {
    ls(v) {
      const { liste, collee, masques } = resultatLs(criteresListe(v), regles, store.tous());
      const note = masques ? ` · ${masques} attach masqué${masques > 1 ? 's' : ''}` : '';
      if (collee) {
        // Liste collée (colonne de GCBLO) : trouvés dans l'ordre collé, puis introuvables et ambigus
        if (liste.length) ecran.tableau(liste);
        const bilan = [pluriel(liste.length, 'trouvé', 'trouvés'), collee.introuvables.length && `${collee.introuvables.length} introuvable${collee.introuvables.length > 1 ? 's' : ''}`,
          collee.ambigus.length && `${collee.ambigus.length} ambigu${collee.ambigus.length > 1 ? 's' : ''}`].filter(Boolean);
        info(`<span class="dim">${bilan.join(' · ')}</span>`);
        if (collee.introuvables.length) erreur(`introuvables : ${esc(collee.introuvables.slice(0, 15).join(', '))}${collee.introuvables.length > 15 ? ` … (+${collee.introuvables.length - 15})` : ''}`);
        if (collee.ambigus.length) info(`<span class="dim">plusieurs dossiers possibles : ${esc(collee.ambigus.slice(0, 10).join(', '))}</span>`);
        return;
      }
      if (!liste.length) return info(store.tous().length ? `aucun dossier ne correspond${note}` : 'aucun dossier enregistré');
      ecran.tableau(liste);
      info(`<span class="dim">${pluriel(liste.length, 'dossier', 'dossiers')}${note} · Ctrl+clic ou Maj+clic : sélectionner</span>`);
      // Écarts d'affect : ce que dit la colonne I pour chacun (correction : double-clic sur la case affect)
      if (criteresListe(v).ecartAffect) {
        const affects = lireAffectsClasseur();
        for (const d of liste) {
          const e = ecartAffect(d, affects);
          if (e) info(`${esc(d.gcblo)} <span class="dim">· registre</span> ${esc(typeParCode(d.type)?.libelle || '—')} <span class="dim">· colonne I</span> ${esc(e.classeur.join(' / '))}`);
        }
      }
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

    /**
     * R12 — Affecte un GCBLO (le crée s'il n'existe pas) et prépare le mail d'affectation.
     * Pas de mail pour Sogetrel. Le dossier, s'il change d'affect, prend la date du jour comme date d'affectation.
     */
    affect(v) {
      const { gcblo } = v.cible, type = v.affect;
      const existant = v.cible.dossier && store.parId(v.cible.dossier.id);
      let ligne;
      if (!existant) {
        const r = regles.creer({ gcblo, type });
        if (!r.ok) return erreur(esc(premiereErreur(r)));
        annulation = { libelle: `la création de ${gcblo}`, faire: () => regles.supprimer(r.dossier.id) };
        ligne = `${esc(gcblo)} créé · affect ${esc(typeParCode(type).libelle)}`;
      } else if (existant.type !== type) {
        const r = regles.modifier(existant.id, { type, dateAffectation: regles.aujourdhui() });
        if (!r.ok) return erreur(esc(premiereErreur(r)));
        annulation = { libelle: `l'affect de ${gcblo}`, faire: () => regles.restaurer([r.avant]) };
        ligne = `${esc(gcblo)} : affect → ${esc(typeParCode(type).libelle)}`;
      } else if (!existant.dateAffectation) {
        // Déjà le bon affect mais sans date (import) : la date affect devient celle du jour
        const r = regles.modifier(existant.id, { dateAffectation: regles.aujourdhui() });
        if (r.ok && !r.inchange) annulation = { libelle: `la date de ${gcblo}`, faire: () => regles.restaurer([r.avant]) };
        ligne = `${esc(gcblo)} est déjà ${esc(typeParCode(type).libelle)} · date du jour`;
      } else ligne = `${esc(gcblo)} est déjà ${esc(typeParCode(type).libelle)}`;
      if (!AFFECTS_MAIL.includes(type)) return ok(`${ligne} <span class="dim">· pas de mail pour ${esc(typeParCode(type).libelle)}</span>${annulation ? ` <span class="dim">·</span> ${LIEN_ANNULE}` : ''}`);
      const mail = mailAffectation(gcblo, type);
      ok(`${ligne} <span class="dim">·</span> ${LIEN_ANNULE}`);
      preparerMail(mail, store.parGcblo(gcblo), 'Mail d’affectation préparé');
    },

    /** R12 — Prépare un mail de relance : « fci » (numéro de commande, seulement s'il manque) ou « dft ». */
    relance(v) {
      const d = store.parId(v.cible.id) || v.cible;
      if (!AFFECTS_MAIL.includes(d.type)) return erreur(`${esc(d.gcblo)} : ${d.type ? `pas de relance pour ${esc(typeParCode(d.type).libelle)}` : 'sans affect · affect ' + esc(d.gcblo) + ' num21|air'}`);
      if (v.motif === 'fci' && d.fci.length) return info(`${esc(d.gcblo)} a déjà un FCI (${esc(d.fci.join(', '))}) : pas de relance`);
      preparerMail(mailRelance(d.gcblo, d.type, v.motif), d, `Relance ${v.motif.toUpperCase()} préparée`);
    },

    /** Retrouve les dossiers d'une liste collée et affiche leurs infos (même liste que ls, éditable). */
    /** Modifie un champ d'un dossier (aussi lancé par le double-clic dans une fiche). */
    edit(v) {
      const brut = v.valeur.trim().replace(/^"(.*)"$/, '$1');
      const vide = ['-', 'aucun', 'aucune', 'vide'].includes(plat(brut));
      const nom = Object.keys(CHAMPS).find(k => CHAMPS[k] === v.champ);
      let valeur;
      switch (v.champ) {
        case 'type': valeur = vide ? null : MOTS_TYPE[plat(brut)]; if (!vide && !valeur) return erreur(`affect inconnu : « ${esc(brut)} » (num21, air, sogetrel)`); break;
        case 'statutDft': valeur = MOTS_STATUT[plat(brut)]; if (!valeur) return erreur(`statut inconnu : « ${esc(brut)} »`); break;
        case 'dateAffectation': valeur = vide ? null : lireDate(brut, regles.aujourdhui()); if (!vide && !valeur) return erreur(`date non comprise : « ${esc(brut)} »`); break;
        case 'dateRelance': valeur = vide ? null : lireDate(brut, regles.aujourdhui()); if (!vide && !valeur) return erreur(`date non comprise : « ${esc(brut)} »`); break;
        case 'valorisation': valeur = vide ? null : brut; break;
        case 'fci': valeur = vide ? [] : brut; break;
        case 'gcblo': valeur = brut; break;
        default: valeur = vide ? '' : brut;          // commune, commentaire
      }
      const r = regles.modifier(v.cible.id, { [v.champ]: valeur });
      if (!r.ok) return erreur(esc(premiereErreur(r)));
      if (r.inchange) return info(`${esc(nom)} déjà à jour`);
      annulation = { libelle: `${nom} de ${r.dossier.gcblo}`, faire: () => regles.restaurer([r.avant]) };
      ok(`${esc(r.dossier.gcblo)} : ${esc(r.dossier.historique.at(-1).detail)} <span class="dim">·</span> ${LIEN_ANNULE}`);
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
      noterAffectsClasseur(r.affects);
      if (r.ongletsAbsents.length === IMPORT_EXCEL.onglets.length) return erreur(`aucun onglet ${IMPORT_EXCEL.onglets.join(', ')} dans ${esc(fichier.name)}`);

      const bilan = [pluriel(r.lus, 'ligne GCBLO', 'lignes GCBLO'), r.nouveaux.length && pluriel(r.nouveaux.length, 'nouveau', 'nouveaux'),
        r.completes.length && `${r.completes.length} à compléter`, r.deja && `${r.deja} déjà à jour`].filter(Boolean);
      info(`${esc(fichier.name)} : ${bilan.join(' · ')}`);
      if (r.ongletsAbsents.length) info(`<span class="dim">onglets absents : ${esc(r.ongletsAbsents.join(', '))}</span>`);
      r.refuses.slice(0, 10).forEach(x => erreur(`onglet ${esc(x.onglet)}, ligne ${x.ligne} : ${esc(x.valeur)} : ${esc(x.motif)}`));
      if (r.refuses.length > 10) erreur(`… et ${r.refuses.length - 10} autres lignes refusées`);
      if (!r.nouveaux.length && !r.completes.length) return info('rien à importer');

      // Affect lu en colonne I ; s'il manque ou n'est pas reconnu, le dossier est créé sans affect (commande « affect » ensuite)
      const sansType = r.nouveaux.filter(n => !n.type);
      if (sansType.length) {
        const exemples = [...new Set(sansType.map(n => n.typeLu).filter(Boolean))].slice(0, 3);
        info(`<span class="dim">${pluriel(sansType.length, 'dossier créé', 'dossiers créés')} sans affect${exemples.length ? ` (non reconnu : ${esc(exemples.join(', '))})` : ''} · ls sans-affect</span>`);
      }
      const creation = appliquerImport(regles, r, 'import Excel'), avant = creation.avant;
      if (creation.crees.length || avant.length) {
        const ids = creation.crees.map(d => d.id);
        annulation = { libelle: 'import', faire: () => { if (ids.length) regles.supprimer(...ids); if (avant.length) regles.restaurer(avant); } };
      }
      creation.refuses.forEach(x => erreur(`${esc(x.saisie.gcblo)} : ${esc(x.erreur)}`));
      ok(`${pluriel(creation.crees.length, 'dossier créé', 'dossiers créés')}${avant.length ? ` · ${pluriel(avant.length, 'complété', 'complétés')}` : ''} <span class="dim">·</span> ${LIEN_ANNULE}`);
    },

    /** R11 — « attachement fichier » choisit la référence ; « attachement ‹dossier› » crée l'attachement. */
    /**
     * R11 — « attachement fichier » choisit la référence ; « attachement ‹dossiers› » crée les attachements.
     * Un seul dossier : on choisit où enregistrer le fichier. Plusieurs (*, un statut, une liste) :
     * on choisit un dossier de destination, tous les fichiers y sont écrits. Chaque dossier passe en Attach.
     */
    async attachement(v) {
      if (v.cibles.some(c => c.fichier)) {
        if (v.cibles.length > 1) return erreur('« fichier » s\'utilise seul : attachement fichier');
        const fichier = await choisirFichier('.xlsx,.xlsm');
        if (!fichier) return info('aucun fichier choisi');
        const octets = new Uint8Array(await fichier.arrayBuffer());
        try { await lireClasseur(octets, { onglets: [] }); } catch (e) { return erreur(esc(e.message)); }
        await coffre.ecrire('attachement-reference', { nom: fichier.name, octets, le: new Date().toISOString() });
        return ok(`référence : ${esc(fichier.name)}`);
      }
      const ref = await coffre.lire('attachement-reference');
      if (!ref) return erreur('aucune référence · attachement fichier');
      const extension = contientMacros(ref.octets) ? 'xlsm' : 'xlsx';      // avec macros : .xlsm, sinon Excel refuse
      const dossiers = v.cibles.map(c => store.parId(c.id) || c);
      const fabriquer = async d => {
        const { cellules, palier, avertissements } = cellulesAttachement(d, regles.aujourdhui());
        return { d, palier, avertissements, nom: `${d.gcblo}.${extension}`, octets: await modifierClasseur(ref.octets, { cellules }) };
      };
      // Statut Attach pour les dossiers faits, en une seule modification (un seul cancel)
      const passerEnAttach = faits => {
        faits.forEach(f => regles.noterAttachement(f.d.id, f.palier?.nom));
        const m = regles.modifierPlusieurs(faits.map(f => f.d.id), { statutDft: 'ATTACH' });
        if (m.ok && m.modifies) annulation = { libelle: `statut Attach de ${pluriel(m.modifies, 'dossier', 'dossiers')}`, faire: () => regles.restaurer(m.avant) };
        return m.ok ? m.modifies : 0;
      };
      const finStatut = n => (n ? ` <span class="dim">·</span> statut → <span class="st-ATTACH">Attach</span> <span class="dim">·</span> ${LIEN_ANNULE}` : '');

      // Un seul dossier : « Enregistrer sous »
      if (dossiers.length === 1) {
        let f;
        try { f = await fabriquer(dossiers[0]); } catch (e) { return erreur(esc(e.message)); }
        f.avertissements.forEach(a => info(`<span class="dim">${esc(a)}</span>`));
        const r = await enregistrerFichier(f.nom, f.octets);
        if (r === 'annule') return info('non enregistré');
        const n = passerEnAttach([f]);
        return ok(`${esc(f.nom)} ${r === 'telecharge' ? 'téléchargé' : 'enregistré'}${f.palier ? ` <span class="dim">· ${esc(f.palier.nom)}</span>` : ''}${finStatut(n)}`);
      }

      // Plusieurs dossiers : un dossier de destination pour tous les fichiers
      if (!(await confirmer(`créer ${dossiers.length} attachements (${dossiers.slice(0, 3).map(d => d.gcblo).join(', ')}${dossiers.length > 3 ? '…' : ''}) ?`))) return info('aucun attachement créé');
      const destination = await choisirDossier('gcblo-attachements');
      if (destination === null) return info('aucun dossier choisi');
      const faits = [], echecs = [], sansPalier = [];
      for (const d of dossiers) {
        try {
          const f = await fabriquer(d);
          if (destination === 'telechargement') await enregistrerFichier(f.nom, f.octets, { telecharger: true });
          else await ecrireDansDossier(destination, f.nom, f.octets);
          if (!f.palier || f.avertissements.length) sansPalier.push(d.gcblo);
          faits.push(f);
        } catch (e) { echecs.push(`${d.gcblo} (${e.message})`); }
      }
      const n = passerEnAttach(faits);
      ok(`${pluriel(faits.length, 'attachement créé', 'attachements créés')}${destination === 'telechargement' ? ' (téléchargés)' : ` <span class="dim">· dans ${esc(destination.name)}</span>`}${finStatut(n)}`);
      if (sansPalier.length) info(`<span class="dim">à vérifier (commune ou valorisation manquante, ou aucun palier) : ${esc(sansPalier.join(', '))}</span>`);
      if (echecs.length) erreur(`échec : ${esc(echecs.join(', '))}`);
    },

    /** Sauvegarde toute la base dans un dossier choisi ; seules les 10 plus récentes y sont gardées. */
    async sauvegarde(v = {}) {
      const maintenant = new Date();
      const nom = nomSauvegarde(maintenant);
      // Le contenu est calculé au dernier moment : après la lecture de classeur-gcblo.csv (R14)
      let r;
      try { r = await sauvegarderDans(nom, () => contenuSauvegarde(store.tous(), maintenant), { changer: v.option === 'dossier' }); } catch (e) { return erreur(`sauvegarde impossible : ${esc(e.message)}`); }
      if (r.etat === 'annule') return info('aucun dossier choisi');
      const n = store.tous().length;
      if (r.etat === 'telecharge') return ok(`${esc(nom)} téléchargé <span class="dim">· ${pluriel(n, 'dossier', 'dossiers')}</span>`);
      if (r.classeur) info(texteClasseur(r.classeur, true));
      ok(`${esc(nom)} <span class="dim">· ${pluriel(n, 'dossier', 'dossiers')} · dans ${esc(r.dossier)} · registre-gcblo.csv à jour</span>`);
      if (r.supprimes?.length) info(`<span class="dim">${GARDER} sauvegardes gardées · supprimée${r.supprimes.length > 1 ? 's' : ''} : ${esc(r.supprimes.join(', '))}</span>`);
    },

    /** Recharge une sauvegarde : remplace toute la base, après confirmation ; annulable. */
    async restore() {
      const fichier = await (choisirSauvegarde || (() => choisirFichier('.json')))();
      if (!fichier) return info('aucun fichier choisi');
      let r;
      try { r = lireSauvegarde(await fichier.text()); } catch (e) { return erreur(esc(e.message)); }
      if (!r.dossiers.length) return erreur('aucun dossier lisible dans cette sauvegarde');
      const quand = r.le ? ` du ${new Date(r.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : '';
      const n = store.tous().length;
      if (!(await confirmer(`remplacer ${n === 1 ? 'le dossier actuel' : `les ${n} dossiers actuels`} par ${r.dossiers.length === 1 ? 'le dossier' : `les ${r.dossiers.length} dossiers`} de la sauvegarde${quand} ?`))) return info('rien n\'a été modifié');
      const avant = store.tous();
      store.remplacerTout(r.dossiers);
      annulation = { libelle: 'la restauration', faire: () => store.remplacerTout(avant) };
      ok(`${pluriel(r.dossiers.length, 'dossier restauré', 'dossiers restaurés')}${quand}${r.ignores ? ` <span class="dim">· ${r.ignores} ignoré${r.ignores > 1 ? 's' : ''} (illisibles ou en double)</span>` : ''} <span class="dim">·</span> ${LIEN_ANNULE}`);
    },

    cancel() {
      if (!annulation) return info('rien à annuler');
      const a = annulation; annulation = null;
      a.faire();
      ok(`annulé : ${esc(a.libelle)}`);
    },

    clear() { ecran.vider(); },

    /** « Aujourd'hui » : ce qui demande une action, chaque ligne cliquable (→ ls des dossiers concernés). */
    today() {
      const jour = regles.aujourdhui();
      const titre = depuisJour(jour).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const affects = lireAffectsClasseur();
      const lignes = pointDuJour(regles.statistiques(), { ecartsAffect: store.tous().filter(d => ecartAffect(d, affects)).length });
      const html = [`<div class="jour-titre">aujourd'hui <span class="dim">· ${esc(titre)}</span></div>`];
      if (!store.tous().length) html.push('<div class="dim">aucun dossier enregistré · <button type="button" class="lien c-verbe" data-commande="import">import</button> pour commencer</div>');
      else if (!lignes.length) html.push('<div class="jour-ok">✓ rien d\'urgent</div>');
      for (const l of lignes) {
        html.push(`<button type="button" class="jour-ligne" data-commande="${esc(l.commande)}" title="${esc(l.commande)}">`
          + `<span class="jour-n ${l.classe}">${l.n}</span><span class="jour-libelle">${esc(l.libelle)}</span>`
          + `${l.conseil ? `<span class="jour-conseil dim">${esc(l.conseil)}</span>` : ''}<span class="jour-cmd c-verbe">${esc(l.commande)}</span></button>`);
      }
      ecran.ligne(`<div class="jour">${html.join('')}</div>`, 'vue');
    },

    /** Recharge la page, en allant chercher la dernière version publiée (comme Ctrl+F5). */
    async refresh() { info('rechargement…'); await recharger(); },

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

  /** Ouvre le mail dans la messagerie, le résume dans le volet (lien pour le rouvrir), et le note dans l'historique. */
  function preparerMail(mail, dossier, note) {
    const lien = lienMailto(mail);
    ouvrirMail(lien);
    info(`mail préparé : <a class="lien" href="${esc(lien)}">${esc(mail.objet)}</a>`);
    info(`<span class="dim">à : ${esc(mail.a.join(', '))}<br>cc : ${esc(mail.cc.join(', '))}</span>`);
    mail.avertissements.forEach(a => info(`<span class="proche">${esc(a)}</span>`));
    if (dossier) regles.noter(dossier.id, 'mail', note);
  }

  return {
    /** Exécute une analyse complète. */
    async executer(analyse) {
      const fn = commandes[analyse.commande.id];
      if (!fn) return erreur(`commande non disponible : ${esc(analyse.commande.id)}`);
      try { await fn(analyse.valeurs); } catch (e) { console.error(e); erreur('erreur inattendue'); }
    }
  };
}
