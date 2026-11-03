/**
 * analyse.js — comprend la ligne en cours de frappe. Ne modifie rien.
 *
 * Entrée : le texte, la position du curseur, et un contexte
 *          { dossiers, aujourdhui: 'AAAA-MM-JJ' }.
 * Sortie : un objet qui décrit tout ce que l'invite a besoin de savoir :
 *   commande    la commande reconnue (ligne de grammaire.js) ou null
 *   valeurs     les valeurs comprises, par nom d'emplacement
 *   enCours     l'emplacement que l'on est en train de remplir, sous le curseur
 *               { sorte, slot, mot, debut, fin, suivant }  (sert à l'autocomplétion)
 *   mots        chaque mot avec son rôle (verbe, dossier, valeur, mot, texte, erreur) pour la couleur
 *   erreurs     problèmes sur les mots déjà tapés (hors mot sous le curseur)
 *   erreurCourante  problème sur le mot sous le curseur (affiché sans bloquer la frappe)
 *   manquants   emplacements obligatoires encore vides
 *   complet     vrai si la commande peut être exécutée telle quelle
 *
 * Elle est appelée à chaque touche : elle doit rester rapide et sans effet.
 */
import { COMMANDES, MOTS_STATUT, MOTS_TYPE, MOTS_FILTRE, GROUPES, PERIODES, JOURS, CHAMPS, plat, commandeParVerbe } from './grammaire.js';
import { FORMATS, typeParCode } from '../config.js';
import { normaliserGcblo, etatRelance } from '../dossiers.js';
import { estEmail } from '../reglages.js';
import { ajouterJours, ecartJours, estJour, versJour } from '../dates.js';

/* ---------------- Découpage ---------------- */

/**
 * Découpe la ligne en mots, en gardant leur position. Un texte entre
 * guillemets ("…" ou « … ») forme un seul mot, même s'il n'est pas refermé.
 */
export function decouper(texte) {
  const mots = [];
  const re = /"([^"]*)"?|«\s*([^»]*)»?|(\S+)/g;
  let m;
  while ((m = re.exec(texte))) {
    const guillemets = m[3] === undefined;
    mots.push({ texte: guillemets ? (m[1] ?? m[2] ?? '') : m[3], debut: m.index, fin: m.index + m[0].length, guillemets });
  }
  return mots;
}

/* ---------------- Lecture des valeurs ---------------- */

/** Dossiers qui correspondent à un mot : GCBLO exact, sinon tous ceux qui le contiennent. */
export function chercherDossiers(mot, dossiers) {
  const cle = normaliserGcblo(mot).replace(/-/g, '');
  if (!cle) return [];
  const exacts = dossiers.filter(d => d.gcblo.replace('-', '') === cle);
  return exacts.length ? exacts : dossiers.filter(d => d.gcblo.replace('-', '').includes(cle));
}

/**
 * Lit une date : demain, apres-demain, aujourdhui, +3 (ou 3j), lundi…dimanche
 * (la prochaine occurrence), 12/11 ou 12/11/2026. Renvoie 'AAAA-MM-JJ' ou null.
 */
export function lireDate(mot, aujourdhui) {
  const p = plat(mot).replace(/'/g, '');
  if (p === 'aujourdhui') return aujourdhui;
  if (p === 'demain') return ajouterJours(aujourdhui, 1);
  if (p === 'apres-demain') return ajouterJours(aujourdhui, 2);
  let m = p.match(/^\+(\d{1,3})j?$|^(\d{1,3})j$/);
  if (m) return ajouterJours(aujourdhui, Number(m[1] ?? m[2]));
  const jour = JOURS.indexOf(p);
  if (jour >= 0) {
    const auj = new Date(`${aujourdhui}T12:00:00`).getDay();
    return ajouterJours(aujourdhui, ((jour - auj + 7) % 7) || 7);
  }
  m = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    const annee = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(aujourdhui.slice(0, 4));
    let iso = `${annee}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!estJour(iso)) return null;
    // Sans année : une date déjà passée depuis plus d'un mois désigne l'an prochain
    if (!m[3] && ecartJours(iso, aujourdhui) < -30) iso = `${annee + 1}${iso.slice(4)}`;
    return estJour(iso) ? iso : null;
  }
  return null;
}

/**
 * Essaie de lire un mot comme valeur d'une « sorte » donnée.
 * Renvoie { ok, valeur?, erreur?, candidats? }.
 */
export function accepter(sorte, mot, ctx, { multiple = false } = {}) {
  const p = plat(mot);
  switch (sorte) {
    case 'dossier': {
      // Groupe (« retard », « proches ») : seulement là où plusieurs dossiers sont permis
      if (GROUPES[p]) {
        if (!multiple) return { ok: false, erreur: `« ${mot} » désigne un groupe : un seul dossier est attendu ici` };
        const liste = ctx.dossiers.filter(d => etatRelance(d, ctx.aujourdhui) === GROUPES[p]);
        return liste.length ? { ok: true, valeur: liste, groupe: p } : { ok: false, erreur: `aucun dossier dans le groupe « ${p} »` };
      }
      const trouves = chercherDossiers(mot, ctx.dossiers);
      if (trouves.length === 1) return { ok: true, valeur: trouves[0] };
      if (trouves.length > 1) return { ok: false, erreur: `« ${mot} » : ${trouves.length} dossiers correspondent, précisez`, candidats: trouves };
      return { ok: false, erreur: `aucun dossier ne correspond à « ${mot} »` };
    }
    case 'dossier-ou-fichier':
      // « fichier » : choisir le classeur de référence ; sinon un dossier
      if (p === 'fichier') return { ok: true, valeur: { fichier: true } };
      { const r = accepter('dossier', mot, ctx); return r.ok ? { ok: true, valeur: { dossier: r.valeur } } : r; }
    case 'nouveau-gcblo': {
      const g = normaliserGcblo(mot);
      if (!FORMATS.gcblo.test(g)) return { ok: false, erreur: `« ${mot} » : format attendu AAA000000-AAA000` };
      const existant = ctx.dossiers.find(d => d.gcblo === g);
      if (existant) return { ok: false, erreur: `${g} existe déjà (${typeParCode(existant.type)?.libelle})` };
      return { ok: true, valeur: g };
    }
    case 'type':
      return MOTS_TYPE[p] ? { ok: true, valeur: MOTS_TYPE[p] } : { ok: false, erreur: `affect inconnu : « ${mot} » (num21, air, sogetrel)` };
    case 'statut-ou-type':
      if (MOTS_STATUT[p]) return { ok: true, valeur: { statut: MOTS_STATUT[p] } };
      if (MOTS_TYPE[p]) return { ok: true, valeur: { type: MOTS_TYPE[p] } };
      return { ok: false, erreur: `« ${mot} » n'est ni un statut ni un affect` };
    case 'filtre':
      if (MOTS_TYPE[p]) return { ok: true, valeur: { type: MOTS_TYPE[p] } };
      if (MOTS_STATUT[p]) return { ok: true, valeur: { statut: MOTS_STATUT[p] } };
      if (MOTS_FILTRE[p]) return { ok: true, valeur: { [MOTS_FILTRE[p]]: true } };
      return { ok: true, valeur: { texte: mot } };
    case 'date': {
      const jour = lireDate(mot, ctx.aujourdhui);
      return jour ? { ok: true, valeur: jour } : { ok: false, erreur: `date non comprise : « ${mot} »` };
    }
    case 'fci': {
      const f = String(mot).toUpperCase();
      return FORMATS.fci.test(f) ? { ok: true, valeur: f } : { ok: false, erreur: `« ${mot} » : un FCI est F suivi de 11 chiffres` };
    }
    case 'ville':
      // Tout mot sert au nom de la ville, sauf une période (« semaine ») qui passe à l'emplacement suivant
      return PERIODES[p] ? { ok: false, erreur: `« ${mot} » est une période, pas une ville` } : { ok: true, valeur: mot };
    case 'periode':
      return PERIODES[p] ? { ok: true, valeur: PERIODES[p] } : { ok: false, erreur: `période inconnue : « ${mot} » (jour, demain, semaine)` };
    case 'adresse':
      if (p === 'aucun' || p === 'aucune') return { ok: true, valeur: '' };
      return estEmail(mot) ? { ok: true, valeur: mot } : { ok: false, erreur: `« ${mot} » n'est pas une adresse email` };
    case 'champ':
      return CHAMPS[p] ? { ok: true, valeur: CHAMPS[p] } : { ok: false, erreur: `champ inconnu : « ${mot} »` };
    case 'commande':
      return commandeParVerbe(mot) ? { ok: true, valeur: commandeParVerbe(mot) } : { ok: false, erreur: `${mot} : commande introuvable` };
    case 'texte':
      return { ok: true, valeur: mot };
    default:
      return { ok: false, erreur: `sorte inconnue : ${sorte}` };
  }
}

/** Mots connus par sorte : sert à savoir si un mot en cours de frappe peut encore devenir valable. */
const MOTS_CONNUS = {
  type: Object.keys(MOTS_TYPE),
  'statut-ou-type': [...Object.keys(MOTS_STATUT), ...Object.keys(MOTS_TYPE)],
  filtre: [...Object.keys(MOTS_STATUT), ...Object.keys(MOTS_TYPE), ...Object.keys(MOTS_FILTRE)],
  date: ['demain', 'apres-demain', 'aujourdhui', ...JOURS],
  dossier: Object.keys(GROUPES),
  'dossier-ou-fichier': ['fichier'],
  champ: Object.keys(CHAMPS),
  periode: Object.keys(PERIODES),
  commande: COMMANDES.flatMap(c => c.verbes)
};
/** Vrai si `mot` est le début d'un mot connu de cette sorte (« re » → « refuse »). */
export const debutPossible = (sorte, mot) => !!plat(mot) && (MOTS_CONNUS[sorte] || []).some(m => m.startsWith(plat(mot)));

/** Le rôle d'un mot (pour sa couleur), selon la sorte de son emplacement. */
const ROLE = { dossier: 'dossier', 'dossier-ou-fichier': 'dossier', 'nouveau-gcblo': 'dossier', texte: 'texte' };
const roleDe = sorte => ROLE[sorte] || 'valeur';

/* ---------------- Analyse ---------------- */

export function analyser(texte, curseur = texte.length, ctx = { dossiers: [], aujourdhui: versJour(new Date()) }) {
  const mots = decouper(texte);
  // Le mot sous le curseur ; s'il n'y en a pas (curseur après un espace), on ajoute un mot vide « virtuel »
  let iCur = mots.findIndex(m => curseur >= m.debut && curseur <= m.fin);
  if (iCur === -1) {
    iCur = mots.filter(m => m.fin < curseur).length;
    mots.splice(iCur, 0, { texte: '', debut: curseur, fin: curseur, virtuel: true });
  }

  const res = { commande: null, valeurs: {}, enCours: null, mots, erreurs: [], erreurCourante: null, manquants: [], complet: false };
  const premier = mots[0];

  // 1. Le verbe
  if (iCur === 0) res.enCours = { sorte: 'verbe', mot: premier.texte, debut: premier.debut, fin: premier.fin };
  const commande = premier.virtuel ? null : commandeParVerbe(premier.texte);
  if (!commande) {
    if (!premier.virtuel) {
      // Verbe en cours de frappe (« rel » → « relance ») : pas encore une erreur
      const enFrappe = iCur === 0 && debutPossible('commande', premier.texte);
      premier.role = enFrappe ? 'brut' : 'erreur';
      if (iCur !== 0) res.erreurs.push(`${premier.texte} : commande introuvable`);
    }
    return res;
  }
  premier.role = 'verbe';
  res.commande = commande;
  const slots = commande.emplacements;

  /**
   * Vrai si `mot` peut commencer l'emplacement n° i (ou celui qui suit un mot de liaison).
   * `partiel` : le mot est en cours de frappe, un simple début suffit (« re » pour « refuse »).
   */
  const peutCommencer = (i, mot, partiel = false) => {
    const sl = slots[i];
    if (!sl) return false;
    if (sl.mot) return sl.mot.startsWith(plat(mot)) || peutCommencer(i + 1, mot, partiel);
    return accepter(sl.sorte, mot, ctx, sl).ok || (partiel && debutPossible(sl.sorte, mot));
  };
  const aDesValeurs = sl => Array.isArray(res.valeurs[sl.nom]) && res.valeurs[sl.nom].length > 0;

  // 2. Les emplacements, dans l'ordre
  let s = 0;
  for (let i = 1; i < mots.length; i++) {
    const m = mots[i];
    const courant = i === iCur;

    if (m.virtuel) {
      // Curseur sur un mot vide : on propose l'emplacement attendu (et le suivant si l'actuel est une liste déjà commencée)
      const sl = slots[s];
      res.enCours = sl
        ? { sorte: sl.mot ? 'mot' : sl.sorte, slot: sl, mot: '', debut: m.debut, fin: m.fin,
            suivant: sl.multiple && aDesValeurs(sl) ? slots[s + 1] || null : null }
        : { sorte: 'fin', mot: '', debut: m.debut, fin: m.fin };
      continue;
    }

    let place = false;
    let liaison = null;          // mot de liaison sauté alors qu'il pouvait être en cours de frappe (« e » → « en »)
    while (s < slots.length && !place) {
      const sl = slots[s];

      // Mot de liaison (« en ») : reconnu s'il est tapé, sauté s'il est omis
      if (sl.mot) {
        if (plat(m.texte) === sl.mot || (courant && sl.mot.startsWith(plat(m.texte)) && !peutCommencer(s + 1, m.texte, true))) {
          m.role = 'mot'; place = true;
          if (courant) res.enCours = { sorte: 'mot', slot: sl, mot: m.texte, debut: m.debut, fin: m.fin };
          if (plat(m.texte) === sl.mot) s++;
        } else {
          if (courant && sl.mot.startsWith(plat(m.texte))) liaison = sl.mot;
          s++;
        }
        continue;
      }

      // Texte libre : prend tout le reste de la ligne
      if (sl.sorte === 'texte') {
        const reste = mots.slice(i).filter(x => !x.virtuel);
        reste.forEach(x => { x.role = 'texte'; });
        res.valeurs[sl.nom] = reste.map(x => x.texte).join(' ');
        if (iCur >= i) res.enCours = { sorte: 'texte', slot: sl, mot: m.texte, debut: m.debut, fin: m.fin };
        i = mots.length; s++; place = true;
        break;
      }

      const r = accepter(sl.sorte, m.texte, ctx, sl);
      // Dans une liste déjà commencée, un mot qui ne convient pas peut être le début de la suite
      if (!r.ok && sl.multiple && aDesValeurs(sl) && peutCommencer(s + 1, m.texte, courant)) { s++; continue; }

      m.role = !r.ok ? 'erreur' : r.groupe ? 'valeur' : roleDe(sl.sorte);
      if (sl.multiple) {
        const liste = (res.valeurs[sl.nom] ||= []);
        // Un groupe apporte plusieurs dossiers d'un coup ; on évite les doublons
        const nouveaux = !r.ok ? [null] : Array.isArray(r.valeur) ? r.valeur : [r.valeur];
        nouveaux.forEach(v => { if (v === null || !liste.includes(v)) liste.push(v); });
      }
      else res.valeurs[sl.nom] = r.ok ? r.valeur : null;
      if (!r.ok) { if (courant) res.erreurCourante = r.erreur; else res.erreurs.push(r.erreur); }
      if (courant) res.enCours = { sorte: sl.sorte, slot: sl, mot: m.texte, debut: m.debut, fin: m.fin, candidats: r.candidats || null, liaison };
      if (!sl.multiple) s++;
      place = true;
    }
    if (!place) {
      m.role = 'erreur';
      if (courant) res.erreurCourante = `« ${m.texte} » : rien n'est attendu ici`;
      else res.erreurs.push(`mot en trop : « ${m.texte} »`);
    }
  }

  // 3. Ce qui manque encore
  const rempli = sl => (sl.multiple ? aDesValeurs(sl) && res.valeurs[sl.nom].every(v => v !== null) : res.valeurs[sl.nom] != null);
  res.manquants = slots.filter(sl => !sl.mot && !sl.optionnel && !rempli(sl)).map(sl => sl.nom);
  res.complet = !res.erreurs.length && !res.erreurCourante && !res.manquants.length;
  res.mots = mots.filter(m => !m.virtuel);
  return res;
}

/** Transforme les valeurs de « ls » en critères pour regles.filtrer(). */
export function criteresListe(valeurs) {
  const c = { texte: '' };
  for (const v of valeurs.filtres || []) {
    if (!v) continue;
    if (v.texte) c.texte = `${c.texte} ${v.texte}`.trim(); else Object.assign(c, v);
  }
  return c;
}

export { COMMANDES };
