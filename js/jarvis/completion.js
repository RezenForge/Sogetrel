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
import { COMMANDES, MOTS_STATUT, MOTS_TYPE, GROUPES, PERIODES, JOURS, plat, motPourCode } from './grammaire.js';
import { STATUTS, TYPES, statutParCode, typeParCode } from '../config.js';
import { formater } from '../dates.js';
import { etatRelance } from '../dossiers.js';
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
  // Dans une liste (« passe 501404 501423 … »), on ne repropose pas un dossier déjà choisi
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
    .map(g => ({ inserer: g.mot_ + ' ', libelle: g.mot_, detail: `groupe · ${g.n} dossier${g.n > 1 ? 's' : ''} ${g.etat === 'retard' ? 'en retard' : 'à relancer sous 3 jours'}`, sorte: 'valeur', alerte: g.etat === 'retard' ? 'retard' : null }));
  return [...groupes, ...base.filter(d => !deja.has(d.id))
    .sort((a, b) => score(a) - score(b) || a.gcblo.localeCompare(b.gcblo))
    .slice(0, MAX)
    .map(d => {
      const e = alerte(d);
      const relance = d.dateRelance ? ` · relance ${formater(d.dateRelance).slice(0, 5)}${e === 'retard' ? ' (retard)' : ''}` : '';
      return { inserer: d.gcblo + ' ', libelle: d.gcblo, detail: `${typeParCode(d.type)?.libelle} · ${statutParCode(d.statutDft)?.libelle}${relance}`, sorte: 'dossier', alerte: e };
    })];
}

const statuts = () => STATUTS.map(s => ({ inserer: motPourCode(MOTS_STATUT, s.code) + ' ', libelle: motPourCode(MOTS_STATUT, s.code), detail: `statut : ${s.libelle}`, sorte: 'valeur' }));
const types = () => TYPES.map(t => ({ inserer: motPourCode(MOTS_TYPE, t.code) + ' ', libelle: motPourCode(MOTS_TYPE, t.code), detail: `type : ${t.libelle}`, sorte: 'valeur' }));

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
    case 'mot': liste = [{ inserer: ec.slot.mot + ' ', libelle: ec.slot.mot, detail: 'puis la valeur', sorte: 'mot' }]; break;
    case 'dossier': liste = dossiers(mot, ctx, ec, analyse); break;
    case 'statut-ou-type': liste = commencePar([...statuts(), ...types()], mot); break;
    case 'type': liste = commencePar(types(), mot); break;
    case 'filtre': liste = commencePar([...types(), ...statuts(),
      { inserer: 'retard ', libelle: 'retard', detail: 'relance en retard', sorte: 'valeur' },
      { inserer: 'sans-fci ', libelle: 'sans-fci', detail: 'sans FCI', sorte: 'valeur' }], mot); break;
    case 'date': liste = commencePar(dates(ctx), mot); break;
    case 'ville': {
      // Villes déjà consultées, et la période dès qu'un nom de ville est commencé
      const deja = (analyse.valeurs.ville || []).length > (mot ? 1 : 0);
      const villes = (ctx.reglages?.villes?.() || []).map(v => ({ inserer: v + ' ', libelle: v, detail: 'ville déjà consultée', sorte: 'valeur' }));
      liste = commencePar([...(deja ? periodes() : []), ...(deja ? [] : villes)], mot);
      break;
    }
    case 'periode': liste = commencePar(periodes(), mot); break;
    case 'adresse': {
      const actuel = ctx.reglages?.destinataire(analyse.valeurs.type) || '';
      liste = commencePar([...(actuel ? [{ inserer: actuel + ' ', libelle: actuel, detail: 'adresse actuelle', sorte: 'valeur' }] : []),
        { inserer: 'aucun ', libelle: 'aucun', detail: 'efface le destinataire', sorte: 'valeur' }], mot);
      break;
    }
    case 'commande': liste = verbes(mot, ctx).map(p => ({ ...p, inserer: p.inserer })); break;
    default: liste = [];
  }

  // « passe 501404 e… » : le mot peut être le début de « en » comme d'un statut ; « en » d'abord
  if (ec.liaison) liste = [{ inserer: ec.liaison + ' ', libelle: ec.liaison, detail: 'puis la valeur', sorte: 'mot' }, ...liste];
  // Liste déjà commencée (« passe 501404 … ») : proposer aussi de passer à la suite (« en »)
  if (ec.suivant?.mot && !mot) liste = [{ inserer: ec.suivant.mot + ' ', libelle: ec.suivant.mot, detail: 'puis la valeur', sorte: 'mot' }, ...liste];

  liste = liste.slice(0, MAX);
  const meilleure = liste[0];
  const fantome = meilleure && mot && plat(meilleure.inserer).startsWith(plat(mot))
    ? meilleure.inserer.trimEnd().slice(mot.length)
    : '';
  return { propositions: liste, fantome, remplace: { debut: ec.debut, fin: ec.fin } };
}

/** Une phrase qui dit ce que la commande va faire. */
export function apercu(analyse, ctx) {
  const c = analyse.commande;
  if (!c) return null;
  if (!analyse.complet) return `${c.forme}`;
  const v = analyse.valeurs;
  const n = liste => `${liste.length} dossier${liste.length > 1 ? 's' : ''}`;
  switch (c.id) {
    case 'ls': return `→ ${n(ctx.regles.filtrer(criteresListe(v)))}`;
    case 'ajoute': return `→ nouveau dossier ${v.gcblo} (${typeParCode(v.type)?.libelle})${v.fci?.length ? `, FCI ${v.fci.join(', ')}` : ''}`;
    case 'passe': {
      const quoi = v.valeur.statut ? `statut → ${statutParCode(v.valeur.statut).libelle}` : `type → ${typeParCode(v.valeur.type).libelle}`;
      return `→ ${v.cibles.length === 1 ? v.cibles[0].gcblo : n(v.cibles)} : ${quoi}${v.cibles.length > 3 ? ' (confirmation)' : ''}`;
    }
    case 'relance': {
      const qui = v.cibles.length === 1 ? v.cibles[0].gcblo : n(v.cibles);
      if (v.date) return `→ relance de ${qui} prévue le ${formater(v.date)}`;
      const types = [...new Set(v.cibles.map(d => d.type))];
      const sans = types.filter(t => !ctx.reglages?.destinataire(t)).map(t => typeParCode(t).libelle);
      return `→ ${v.cibles.length === 1 ? 'email de relance' : `${types.length > 1 ? `${types.length} emails récapitulatifs` : 'email récapitulatif'}`} pour ${qui}${sans.length ? ` · sans destinataire : ${sans.join(', ')}` : ''}`;
    }
    case 'jour': return '→ le point du jour';
    case 'wiki': return `→ définition de « ${v.terme} » (Wikipédia)`;
    case 'meteo': return `→ météo de ${v.ville.join(' ')} · ${{ jour: 'aujourd\'hui', demain: 'demain', semaine: '7 jours' }[v.periode || 'jour']} (service Open-Meteo)`;
    case 'email':
      if (!v.type) return '→ affiche les destinataires';
      if (v.adresse === undefined || v.adresse === null) return `→ destinataire ${typeParCode(v.type).libelle} : ${ctx.reglages?.destinataire(v.type) || 'aucun'}`;
      return `→ destinataire ${typeParCode(v.type).libelle} : ${v.adresse || 'effacé'}`;
    case 'fci': return `→ ${v.cible.gcblo} : + ${v.fci.join(', ')}`;
    case 'note': return `→ note ajoutée à ${v.cible.gcblo}`;
    case 'ouvre': return `→ fiche de ${v.cible.gcblo}`;
    case 'supprime': return `→ suppression de ${v.cibles.length === 1 ? v.cibles[0].gcblo : n(v.cibles)} (confirmation)`;
    default: return `→ ${c.resume}`;
  }
}
