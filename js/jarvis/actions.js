/**
 * actions.js — exécute une commande comprise (analyse complète).
 *
 * Il ne modifie jamais les données lui-même : il appelle les règles de
 * dossiers.js, puis écrit le résultat à l'écran. Il garde de quoi annuler
 * la dernière modification (commande « annule »).
 *
 * Ce dont il a besoin lui est donné à la création (rien n'est caché) :
 *   regles, store            les données et leurs règles
 *   reglages                 destinataires des emails par type, villes récentes
 *   meteo                    service météo (meteo.js)
 *   wiki                     définitions Wikipédia (wiki.js)
 *   ecran                    { ligne(html, classe), tableau(dossiers), fiche(dossier), vider() }
 *   confirmer(question)      → Promise<boolean>  (l'invite pose la question o/n)
 *   demander(question, choix) → Promise<choix|null>  (question à choix, avec propositions)
 *   ouvrirLien(url)          ouvre l'email (mailto:)
 *   telecharger(nom, texte)  propose un fichier à enregistrer
 *   choisirFichier()         → Promise<File|null>
 */
import { COMMANDES, SORTES } from './grammaire.js';
import { criteresListe } from './analyse.js';
import { TYPES, STATUTS, STOCKAGE, typeParCode, statutParCode } from '../config.js';
import { formater, depuisJour, ecartJours } from '../dates.js';
import { lireCollage } from '../collage.js';
import { temps } from '../meteo.js';
import { convertirV1, estFormatV1 } from '../reprise-v1.js';

/** Échappe un texte avant de l'insérer dans du HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const SEUIL_CONFIRMATION = 3;

export function creerActions({ regles, store, reglages, meteo, wiki, ecran, confirmer, demander, ouvrirLien, telecharger, choisirFichier }) {
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

    /**
     * Sans date : prépare l'email (un seul email récapitulatif par destinataire si
     * plusieurs dossiers), note la relance, puis propose la relance suivante à J+7.
     * Avec une date : planifie la relance de tous les dossiers donnés.
     */
    async relance(v) {
      const cibles = v.cibles, ids = cibles.map(d => d.id);
      const qui = cibles.length === 1 ? esc(cibles[0].gcblo) : pluriel(cibles.length, 'dossier', 'dossiers');

      if (v.date) {
        if (cibles.length > SEUIL_CONFIRMATION && !(await confirmer(`planifier la relance de ${cibles.length} dossiers au ${formater(v.date)} ?`))) return info('rien n\'a été modifié');
        const r = regles.modifierPlusieurs(ids, { dateRelance: v.date });
        if (!r.ok) return erreur(esc(premiereErreur(r)));
        if (r.modifies) annulation = { libelle: `la date de relance de ${qui}`, faire: () => regles.restaurer(r.avant) };
        return ok(`relance de ${qui} prévue le ${formater(v.date)}`);
      }

      // Un email par destinataire (le destinataire dépend du type du dossier)
      const parDestinataire = new Map();
      for (const d of cibles) {
        const a = reglages.destinataire(d.type);
        parDestinataire.set(a, [...(parDestinataire.get(a) || []), d]);
      }
      const emails = [...parDestinataire].map(([a, liste]) => {
        const { objet, corps } = regles.email(liste);
        return { a, liste, url: `mailto:${encodeURIComponent(a)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps.replace(/\n/g, '\r\n'))}` };
      });
      ouvrirLien(emails[0].url);
      regles.noterRelances(ids);
      ok(`${emails.length > 1 ? `${emails.length} emails préparés` : cibles.length > 1 ? 'email récapitulatif préparé' : 'email de relance préparé'} pour ${qui}`);
      // Le navigateur n'ouvre qu'un email par action : les suivants sont des liens à cliquer
      emails.slice(1).forEach(e => ecran.ligne(`  <a href="${esc(e.url)}">ouvrir l'email suivant</a> <span class="dim">→ ${esc(e.a || 'sans destinataire')} · ${pluriel(e.liste.length, 'dossier', 'dossiers')}</span>`));
      const sans = [...new Set(cibles.filter(d => !reglages.destinataire(d.type)).map(d => typeParCode(d.type).libelle))];
      if (sans.length) info(`<span class="dim">astuce : <span class="c-verbe">email</span> <span class="c-valeur">${esc(sans[0].toLowerCase())}</span> prenom.nom@… pour pré-remplir le destinataire ${esc(sans.join(', '))}</span>`);

      // R5 — relance suivante
      const suivante = regles.jourRelanceSuivante();
      if (await confirmer(`planifier la prochaine relance au ${formater(suivante)} pour ${cibles.length === 1 ? cibles[0].gcblo : `ces ${cibles.length} dossiers`} ?`)) {
        const r = regles.modifierPlusieurs(ids, { dateRelance: suivante });
        if (r.ok && r.modifies) annulation = { libelle: `la date de relance de ${qui}`, faire: () => regles.restaurer(r.avant) };
        ok(`prochaine relance le ${formater(suivante)}`);
      }
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

    jour() { point(); },

    /** Définition d'un mot ou d'une expression (début de l'article Wikipédia). */
    async wiki(v) {
      const terme = v.terme.trim();
      let r;
      try { r = await wiki.chercher(terme); } catch (e) { return erreur(esc(e.message)); }
      if (!r.page) return erreur(`aucune page Wikipédia pour « ${esc(terme)} »`);
      const lien = `<a href="${esc(r.page.url)}" target="_blank" rel="noopener">lire sur Wikipédia</a>`;
      const autres = r.autres.length
        ? `\n<span class="dim">${r.homonymie ? 'plusieurs sens possibles' : 'voir aussi'} : </span>${r.autres.map(t => `<span class="c-valeur">${esc(t)}</span>`).join('<span class="dim"> · </span>')}`
        : '';
      if (r.homonymie) {
        return ecran.ligne(`<b>wiki</b> · ${esc(r.page.titre)}\n<span class="dim">« ${esc(terme)} » a plusieurs sens. Précisez, par exemple : </span><span class="c-verbe">wiki</span> <span class="c-texte">${esc(r.autres[0] || terme)}</span>${autres}\n${lien}`);
      }
      ecran.ligne(`<b>wiki</b> · ${esc(r.page.titre)}${r.page.description ? ` <span class="dim">— ${esc(r.page.description)}</span>` : ''}\n${esc(r.page.extrait || '(pas de résumé disponible)')}\n${lien}${autres}`);
    },

    /** Météo d'une ville : aujourd'hui ou demain (heure par heure), ou 7 jours. */
    async meteo(v) {
      const nom = v.ville.join(' ');
      const periode = v.periode || 'jour';
      let lieux, p;
      try {
        lieux = await meteo.chercherVille(nom);
        if (!lieux.length) return erreur(`ville introuvable : « ${esc(nom)} »`);
        p = await meteo.prevision(lieux[0]);
      } catch (e) { return erreur(esc(e.message)); }
      const lieu = lieux[0];
      reglages.noterVille(nom);

      // Mise en forme compacte : tient dans ~40 caractères (écran de téléphone)
      const degres = t => `<span class="${t <= 3 ? 'ty-NUM21' : t >= 28 ? 'retard' : t >= 22 ? 'proche' : ''}">${Math.round(t)}°</span>`;
      const minMax = (a, b) => `${degres(a)}/${degres(b)}`;
      const risque = r => `<span class="${r >= 60 ? 'c-valeur' : 'dim'}">${String(r ?? 0).padStart(3)} %</span>`;
      const mm = x => String(x ?? 0).replace('.', ',');
      const ciel = (code, largeur) => { const [sym, l] = temps(code); return `${sym} ${esc(l.padEnd(largeur))}`; };
      const nomJour = j => depuisJour(j).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
      const largeurTemp = (a, b) => `${Math.round(a)}°/${Math.round(b)}°`.length;
      const ou = `${esc(lieu.nom)}${lieu.region ? ` <span class="dim">(${esc(lieu.region)}${lieu.pays && lieu.pays !== 'France' ? `, ${esc(lieu.pays)}` : ''})</span>` : ''}`;

      if (periode === 'semaine') {
        const lignes = p.jours.map(j => `${esc(nomJour(j.jour).padEnd(9))} ${ciel(j.code, 13)} ${minMax(j.min, j.max)}${' '.repeat(Math.max(1, 8 - largeurTemp(j.min, j.max)))}${risque(j.risquePluie)}  <span class="dim">${mm(j.pluie)} mm · vent ${Math.round(j.vent)}</span>`);
        return ecran.ligne(`<b>météo</b> · ${ou} · <span class="dim">7 jours</span>\n<pre>${lignes.join('\n')}</pre>`);
      }
      const j = periode === 'demain' ? p.jours[1] : p.jours[0];
      if (!j) return erreur('prévision indisponible pour ce jour');
      const lignes = [];
      if (periode === 'jour') {
        lignes.push(`<span class="dim">maintenant</span>  ${degres(p.actuel.temperature)}  ${ciel(p.actuel.code, 0).trim()}`);
        lignes.push(`<span class="dim">            vent ${Math.round(p.actuel.vent)} km/h · humidité ${Math.round(p.actuel.humidite)} %</span>`);
      }
      lignes.push(`<span class="dim">${periode === 'jour' ? 'journée   ' : 'demain    '}</span>  ${minMax(j.min, j.max)}  ${ciel(j.code, 0).trim()}`);
      lignes.push(`<span class="dim">            pluie ${mm(j.pluie)} mm ·</span>${risque(j.risquePluie)}`);
      const heures = p.heures.filter(h => h.jour === j.jour && h.heure >= 6 && h.heure <= 21 && h.heure % 3 === 0)
        .map(h => `<span class="dim">${String(h.heure).padStart(2, '0')}h</span> ${String(Math.round(h.temperature)).padStart(2)}° ${temps(h.code)[0]}`);
      for (let i = 0; i < heures.length; i += 3) lignes.push(heures.slice(i, i + 3).join('   '));
      ecran.ligne(`<b>météo</b> · ${ou} · <span class="dim">${esc(depuisJour(j.jour).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' }))}</span>\n<pre>${lignes.join('\n')}</pre>`);
    },

    email(v) {
      if (!v.type) {
        info('destinataires des relances :');
        TYPES.forEach(t => info(`  <span class="ty-${t.code}">${esc(t.libelle.padEnd(10))}</span>${esc(reglages.destinataire(t.code) || '—')}`));
        return info('<span class="dim">pour régler : email ‹type› ‹adresse›</span>');
      }
      const libelle = typeParCode(v.type).libelle;
      if (v.adresse === undefined || v.adresse === null) return info(`destinataire ${esc(libelle)} : ${esc(reglages.destinataire(v.type) || 'aucun')}`);
      const r = reglages.definirDestinataire(v.type, v.adresse);
      if (r.erreur) return erreur(esc(r.erreur));
      ok(v.adresse ? `les relances ${esc(libelle)} iront à ${esc(v.adresse)}` : `destinataire ${esc(libelle)} effacé`);
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

  /** R8 — le point du jour, affiché à l'ouverture et par la commande « jour ». */
  function point() {
    const p = regles.pointDuJour();
    const date = depuisJour(regles.aujourdhui()).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    ecran.ligne(`<b>point du jour</b> <span class="dim">· ${esc(date)}</span>`, 'info');
    const section = (titre, liste, classe, detail) => {
      if (!liste.length) return;
      const lignes = liste.slice(0, 8).map(d =>
        `  <span class="c-dossier">${esc(d.gcblo)}</span> <span class="ty-${d.type}">${esc(typeParCode(d.type).libelle.padEnd(8))}</span> <span class="dim">${esc(detail(d))}</span>`);
      if (liste.length > 8) lignes.push(`  <span class="dim">… et ${liste.length - 8} autres</span>`);
      ecran.ligne(`<span class="${classe}">${esc(titre)} (${liste.length})</span>\n${lignes.join('\n')}`);
    };
    const quand = d => {
      const ecart = ecartJours(d.dateRelance, regles.aujourdhui());
      return ecart < 0 ? `${formater(d.dateRelance).slice(0, 5)} · ${-ecart} j` : formater(d.dateRelance).slice(0, 5);
    };
    section('en retard', p.retard, 'retard', quand);
    section('à relancer aujourd\'hui', p.aujourdhui, 'proche', d => statutParCode(d.statutDft).libelle);
    section('à relancer sous 3 jours', p.proches, 'proche', quand);
    section('refusés, à reprendre', p.refuses, 'st-REFUSE', d => statutParCode(d.statutDft).libelle);
    const conseils = [
      p.retard.length && '<span class="c-verbe">relance</span> <span class="c-valeur">retard</span>',
      p.aujourdhui.length + p.proches.length && '<span class="c-verbe">relance</span> <span class="c-valeur">proches</span>',
      p.refuses.length && '<span class="c-verbe">ls</span> <span class="c-valeur">refuse</span>'
    ].filter(Boolean);
    if (!p.retard.length && !p.aujourdhui.length && !p.proches.length && !p.refuses.length) ecran.ligne('✓ rien d\'urgent aujourd\'hui', 'ok');
    else ecran.ligne(`<span class="dim">→</span> ${conseils.join('<span class="dim">  ·  </span>')}`);
  }

  /**
   * R9 — une liste collée (Excel, mail) : lecture, récapitulatif, type demandé une
   * seule fois pour les lignes qui n'en ont pas, confirmation, création en lot.
   */
  async function collage(texte) {
    const lot = lireCollage(texte, store.tous());
    const parties = [
      pluriel(lot.nouveaux.length, 'nouveau', 'nouveaux'),
      lot.existants.length && `${lot.existants.length} déjà présent${lot.existants.length > 1 ? 's' : ''}`,
      lot.doublons.length && `${lot.doublons.length} en double dans la liste`,
      lot.illisibles.length && `${lot.illisibles.length} ligne${lot.illisibles.length > 1 ? 's' : ''} sans GCBLO`
    ].filter(Boolean);
    info(`${pluriel(lot.lus, 'GCBLO trouvé', 'GCBLO trouvés')} : ${parties.join(', ')}`);
    lot.conflits.forEach(c => ecran.ligne(`  ⚠ ${esc(c.gcblo)} figure en ${esc(typeParCode(c.garde).libelle)} et en ${esc(typeParCode(c.autre).libelle)} : gardé en ${esc(typeParCode(c.garde).libelle)}, à vérifier (<span class="c-verbe">passe</span> <span class="c-dossier">${esc(c.gcblo)}</span> <span class="c-mot">en</span> <span class="c-valeur">${esc(c.autre.toLowerCase())}</span> pour corriger)`, 'proche'));
    if (lot.existants.length) info(`<span class="dim">  déjà présents : ${esc(lot.existants.slice(0, 6).map(e => e.gcblo).join(', '))}${lot.existants.length > 6 ? '…' : ''}</span>`);
    if (!lot.nouveaux.length) return info('rien à créer');

    // Le type : celui des colonnes ou de la ligne, sinon demandé une fois pour tous
    const sansType = lot.nouveaux.filter(n => !n.type);
    if (sansType.length) {
      const choix = await demander(`type pour ${sansType.length === lot.nouveaux.length ? 'ces' : `les ${sansType.length}`} ${pluriel(sansType.length, 'dossier', 'dossiers')} sans type ?`, ['num21', 'air', 'sogetrel']);
      if (!choix) return info('rien n\'a été créé');
      const code = { num21: 'NUM21', air: 'AIR', sogetrel: 'SOGETREL' }[choix];
      sansType.forEach(n => { n.type = code; });
    }
    const apercu = lot.nouveaux.slice(0, 10).map(n => `  <span class="c-dossier">${esc(n.gcblo)}</span>  <span class="ty-${n.type}">${esc(typeParCode(n.type).libelle.padEnd(8))}</span> <span class="dim">${esc(n.fci.join(', ') || 'sans FCI')}</span>`);
    if (lot.nouveaux.length > 10) apercu.push(`  <span class="dim">… et ${lot.nouveaux.length - 10} autres</span>`);
    ecran.ligne(apercu.join('\n'));
    if (!(await confirmer(`créer ${pluriel(lot.nouveaux.length, 'dossier', 'dossiers')} ?`))) return info('rien n\'a été créé');

    const r = regles.creerPlusieurs(lot.nouveaux.map(n => ({ type: n.type, gcblo: n.gcblo, fci: n.fci })));
    if (r.crees.length) {
      annulation = { libelle: `la création de ${pluriel(r.crees.length, 'dossier', 'dossiers')}`, faire: () => regles.supprimer(...r.crees.map(d => d.id)) };
      ok(`${pluriel(r.crees.length, 'dossier créé', 'dossiers créés')} · tapez <span class="c-verbe">annule</span> pour revenir en arrière`);
    }
    r.refuses.forEach(x => erreur(`${esc(x.saisie.gcblo)} : ${esc(x.erreur)}`));
  }

  return {
    point,
    collage,
    /** Exécute une analyse complète. */
    async executer(analyse) {
      const fn = commandes[analyse.commande.id];
      if (!fn) return erreur(`commande non disponible : ${esc(analyse.commande.id)}`);
      try { await fn(analyse.valeurs); } catch (e) { console.error(e); erreur('une erreur inattendue s\'est produite'); }
    }
  };
}
