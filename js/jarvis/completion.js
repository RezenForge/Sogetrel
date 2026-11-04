/**
 * completion.js — ce que l'invite propose pendant la frappe. Ne modifie rien.
 *
 * À partir du résultat de analyse.js :
 *   proposer(analyse, ctx) → { propositions, fantome, remplace }
 *     propositions  liste classée de { inserer, libelle, detail, sorte }
 *     fantome       la fin grisée de la meilleure proposition, affichée après le curseur
 *     remplace      { debut, fin } : la partie de la ligne que la proposition remplace
 *   apercu(analyse, ctx) → texte qui décrit l'effet de la commande, ou null
 *
 * ctx = { dossiers, aujourdhui, regles, recents: [verbes récents] }
 */
import { COMMANDES, MOTS_STATUT, MOTS_TYPE, GROUPES, PERIODES, JOURS, CHAMPS, plat, motPourCode } from './grammaire.js';
import { STATUTS, TYPES, IMPORT_EXCEL, statutParCode, typeParCode } from '../config.js';
import { formater } from '../dates.js';
import { etatRelance } from '../dossiers.js';
import { chercherListe } from '../info.js';
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
import { chercherDossiers, lireDate, criteresListe } from './analyse.js';

const MAX = 8;

/** Garde les propositions dont le mot à insérer commence par ce qui est tapé. */
const commencePar = (liste, mot) => liste.filter(p => plat(p.inserer).startsWith(plat(mot)));

/* ---------------- Propositions par sorte ---------------- */

function verbes(mot, ctx) {
  const p = plat(mot);
  const liste = COMMANDES.map(c => {
    const verbe = c.verbes.find(v => v.startsWith(p));
    return verbe ? { inserer: verbe + ' ', libelle: c.forme, detail: c.resume, sorte: 'verbe', id: c.id } : null;
  }).filter(Boolean);
  // Les commandes utilisées récemment d'abord
  const rang = id => { const i = (ctx.recents || []).indexOf(id); return i === -1 ? 99 : i; };
  return liste.sort((a, b) => rang(a.id) - rang(b.id));
}

function dossiers(mot, ctx, enCours, analyse) {
  // Dans une liste (« set 501404 501423 … »), on ne repropose pas un dossier déjà choisi
  const choisis = enCours.slot?.multiple ? analyse.valeurs[enCours.slot.nom] || [] : [];
  const deja = new Set(choisis.filter(Boolean).map(d => d.id));
  const base = mot ? chercherDossiers(mot, ctx.dossiers) : ctx.dossiers;
  const cle = plat(mot).replace(/-/g, '');
  const alerte = d => ctx.regles?.etatRelance(d) || null;
  const pourRelance = analyse.commande?.id === 'relance';
  const score = d => {
    const pos = cle ? d.gcblo.toLowerCase().replace('-', '').indexOf(cle) : 0;
    const urgence = pourRelance ? ({ retard: 0, proche: 1 }[alerte(d)] ?? 2) : 0;
    return urgence * 1000 + pos;
  };
  // Groupes (« retard », « proches ») là où plusieurs dossiers sont permis, s'ils ne sont pas vides
  const groupes = !enCours.slot?.multiple ? [] : Object.entries(GROUPES)
    .map(([mot_, etat]) => ({ mot_, n: ctx.dossiers.filter(d => etatRelance(d, ctx.aujourdhui) === etat).length, etat }))
    .filter(g => g.n && g.mot_.startsWith(plat(mot)))
    .map(g => ({ inserer: g.mot_ + ' ', libelle: g.mot_, detail: `${g.n} ${g.etat === 'retard' ? 'en retard' : 'sous 3 j'}`, sorte: 'valeur', alerte: g.etat === 'retard' ? 'retard' : null }));
  // « * » : la liste affichée (ls, info), là où plusieurs dossiers sont permis
  const affichee = enCours.slot?.multiple ? ctx.listeAffichee?.() || [] : [];
  const etoile = affichee.length && '*'.startsWith(mot) ? [{ inserer: '* ', libelle: '*', detail: `les ${affichee.length} dossiers affichés`, sorte: 'valeur' }] : [];
  return [...etoile, ...groupes, ...base.filter(d => !deja.has(d.id))
    .sort((a, b) => score(a) - score(b) || a.gcblo.localeCompare(b.gcblo))
    .slice(0, MAX)
    .map(d => {
      const e = alerte(d);
      const relance = d.dateRelance ? ` · relance ${formater(d.dateRelance).slice(0, 5)}${e === 'retard' ? ' (retard)' : ''}` : '';
      return { inserer: d.gcblo + ' ', libelle: d.gcblo, detail: `${typeParCode(d.type)?.libelle || 'sans affect'} · ${statutParCode(d.statutDft)?.libelle}${relance}`, sorte: 'dossier', alerte: e };
    })];
}

const statuts = () => STATUTS.map(s => ({ inserer: motPourCode(MOTS_STATUT, s.code) + ' ', libelle: motPourCode(MOTS_STATUT, s.code), detail: s.libelle, sorte: 'valeur' }));
const types = () => TYPES.map(t => ({ inserer: motPourCode(MOTS_TYPE, t.code) + ' ', libelle: motPourCode(MOTS_TYPE, t.code), detail: t.libelle, sorte: 'valeur' }));

const periodes = () => [['jour', 'aujourd\'hui, heure par heure'], ['demain', 'demain, heure par heure'], ['semaine', '7 jours']]
  .map(([m, d]) => ({ inserer: m + ' ', libelle: m, detail: d, sorte: 'valeur' }));

function dates(ctx) {
  const mots = ['demain', '+3', '+7', 'apres-demain', ...JOURS.slice(1), JOURS[0]];
  return mots.map(m => {
    const jour = lireDate(m, ctx.aujourdhui);
    return { inserer: m + ' ', libelle: m, detail: `le ${formater(jour)}`, sorte: 'valeur' };
  });
}

/* ---------------- API ---------------- */

export function proposer(analyse, ctx) {
  const ec = analyse.enCours;
  const vide = { propositions: [], fantome: '', remplace: null };
  if (!ec) return vide;
  const mot = ec.mot || '';
  let liste = [];

  switch (ec.sorte) {
    case 'verbe': liste = verbes(mot, ctx); break;
    case 'mot': liste = [{ inserer: ec.slot.mot + ' ', libelle: ec.slot.mot, detail: '', sorte: 'mot' }]; break;
    case 'dossier': liste = dossiers(mot, ctx, ec, analyse); break;
    case 'gcblo': liste = dossiers(mot, ctx, ec, analyse); break;
    case 'motif-relance': liste = commencePar([{ inserer: 'fci ', libelle: 'fci', detail: 'numéro de commande', sorte: 'valeur' }, { inserer: 'dft ', libelle: 'dft', detail: 'DFT, docs GCB1 et GCB2', sorte: 'valeur' }], mot); break;
    case 'attachement': liste = [...commencePar([{ inserer: 'fichier ', libelle: 'fichier', detail: 'choisir la référence', sorte: 'valeur' },
      ...STATUTS.map(st => ({ inserer: motPourCode(MOTS_STATUT, st.code) + ' ', libelle: motPourCode(MOTS_STATUT, st.code), detail: `tous les dossiers ${st.libelle}`, sorte: 'valeur' }))], mot),
      ...dossiers(mot, ctx, ec, analyse)]; break;
    case 'dossier-ou-fichier': liste = [...commencePar([{ inserer: 'fichier ', libelle: 'fichier', detail: 'référence', sorte: 'valeur' }], mot), ...dossiers(mot, ctx, ec, analyse)]; break;
    case 'statut-ou-type': liste = commencePar([...statuts(), ...types()], mot); break;
    case 'type': liste = commencePar(types(), mot); break;
    case 'filtre': liste = commencePar([...types(), ...statuts(),
      { inserer: 'retard ', libelle: 'retard', detail: 'relance en retard', sorte: 'valeur' },
      { inserer: 'proches ', libelle: 'proches', detail: 'relance sous 3 jours', sorte: 'valeur' },
      { inserer: 'sans-fci ', libelle: 'sans-fci', detail: 'sans FCI', sorte: 'valeur' },
      { inserer: 'fci-retard ', libelle: 'fci-retard', detail: 'affecté depuis plus de 24 h, sans FCI', sorte: 'valeur' },
      { inserer: 'sans-valo ', libelle: 'sans-valo', detail: 'sans valorisation', sorte: 'valeur' },
      { inserer: 'sans-affect ', libelle: 'sans-affect', detail: 'sans affect', sorte: 'valeur' }], mot); break;
    case 'date': liste = commencePar(dates(ctx), mot); break;
    case 'ville': {
      // Villes déjà consultées, et la période dès qu'un nom de ville est commencé
      const deja = (analyse.valeurs.ville || []).length > (mot ? 1 : 0);
      const villes = (ctx.reglages?.villes?.() || []).map(v => ({ inserer: v + ' ', libelle: v, detail: 'ville déjà consultée', sorte: 'valeur' }));
      liste = commencePar([...(deja ? periodes() : []), ...(deja ? [] : villes)], mot);
      break;
    }
    case 'periode': liste = commencePar(periodes(), mot); break;
    case 'champ': liste = commencePar(Object.keys(CHAMPS).map(c => ({ inserer: c + ' ', libelle: c, detail: '', sorte: 'valeur' })), mot); break;
    case 'adresse': {
      const actuel = ctx.reglages?.destinataire(analyse.valeurs.type) || '';
      liste = commencePar([...(actuel ? [{ inserer: actuel + ' ', libelle: actuel, detail: 'adresse actuelle', sorte: 'valeur' }] : []),
        { inserer: 'aucun ', libelle: 'aucun', detail: 'efface le destinataire', sorte: 'valeur' }], mot);
      break;
    }
    case 'commande': liste = verbes(mot, ctx).map(p => ({ ...p, inserer: p.inserer })); break;
    default: liste = [];
  }

  // « set 501404 t… » : le mot peut être le début du mot de liaison comme d'une valeur ; la liaison d'abord
  if (ec.liaison) liste = [{ inserer: ec.liaison + ' ', libelle: ec.liaison, detail: '', sorte: 'mot' }, ...liste];
  // Liste déjà commencée (« set 501404 … ») : proposer aussi de passer à la suite (« to »)
  if (ec.suivant?.mot && !mot) liste = [{ inserer: ec.suivant.mot + ' ', libelle: ec.suivant.mot, detail: '', sorte: 'mot' }, ...liste];

  liste = liste.slice(0, MAX);
  const meilleure = liste[0];
  const fantome = meilleure && mot && plat(meilleure.inserer).startsWith(plat(mot))
    ? meilleure.inserer.trimEnd().slice(mot.length)
    : '';
  return { propositions: liste, fantome, remplace: { debut: ec.debut, fin: ec.fin } };
}

/** Une phrase qui dit ce que la commande va faire (sa forme tant qu'elle est incomplète). */
export function apercu(analyse, ctx) {
  const c = analyse.commande;
  if (!c) return null;
  if (!analyse.complet) return c.forme;
  const v = analyse.valeurs;
  const n = liste => `${liste.length} dossier${liste.length > 1 ? 's' : ''}`;
  switch (c.id) {
    case 'ls': return `→ ${n(ctx.regles.filtrer(criteresListe(v)))}`;
    case 'open': return `→ fiche de ${v.cible.gcblo}`;
    case 'affect': return `→ ${v.cible.gcblo}${v.cible.dossier ? '' : ' (nouveau)'} : affect → ${typeParCode(v.affect).libelle}${v.affect === 'SOGETREL' ? '' : ' · mail d’affectation'}`;
    case 'relance': return `→ mail de relance ${v.motif.toUpperCase()} · ${v.cible.gcblo}`;
    case 'import': return `→ onglets ${IMPORT_EXCEL.onglets.join(', ')}`;
    case 'attachement': {
      if (v.cibles.some(c => c.fichier)) return '→ choisir la référence';
      return v.cibles.length === 1 ? `→ ${v.cibles[0].gcblo}.xlsx` : `→ ${v.cibles.length} attachements dans un dossier à choisir (confirmation)`;
    }
    case 'info': { const r = chercherListe(v.liste, ctx.dossiers); return `→ ${pluriel(r.trouves.length, 'trouvé', 'trouvés')}${r.introuvables.length ? ` · ${r.introuvables.length} introuvable${r.introuvables.length > 1 ? 's' : ''}` : ''}`; }
    case 'edit': return `→ ${v.cible.gcblo} : ${Object.keys(CHAMPS).find(k => CHAMPS[k] === v.champ)} → ${v.valeur}`;
    case 'delete': return `→ suppression de ${v.cibles.length === 1 ? v.cibles[0].gcblo : n(v.cibles)} (confirmation)`;
    case 'set': {
      const quoi = v.valeur.statut ? `statut → ${statutParCode(v.valeur.statut).libelle}` : `affect → ${typeParCode(v.valeur.type).libelle}`;
      return `→ ${v.cibles.length === 1 ? v.cibles[0].gcblo : n(v.cibles)} : ${quoi}${v.cibles.length > 3 ? ' (confirmation)' : ''}`;
    }
    default: return `→ ${c.resume}`;
  }
}
