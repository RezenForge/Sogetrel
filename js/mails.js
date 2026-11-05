/**
 * mails.js — R12 : les mails d'affectation et de relance (commandes « affect » et « relance »).
 *
 * Fonctions pures : elles composent le mail (destinataires, copie, objet, texte) ;
 * la commande l'ouvre ensuite dans la messagerie (lien mailto:).
 * Adresses et boîtes BL : MAILS dans config.js. Textes : ici, un par affect.
 *
 *   mailAffectation(gcblo, type)      → { a, cc, objet, corps, avertissements }
 *   mailRelance(gcblo, type, motif)   → idem ; motif : 'fci' (numéro de commande) ou 'dft'
 *   lienMailto(mail)                  → 'mailto:…'
 *   mailAttachement(gcblo, type)      → { a, cc, objet, corps, avertissements } (pôle facturation, avec l'attachement)
 *   csvMailsAttachement(existant, mails) → texte de mails-attachement.csv (lu par la macro Outlook)
 * type : 'NUM21' ou 'AIR' (pas de mail pour Sogetrel).
 */
import { MAILS } from './config.js';

/** La boîte BL selon les 3 premières lettres du GCBLO (LPC ou Aquitaine), ou null. */
export const boitePour = gcblo => MAILS.boites.find(b => b.prefixes.includes(gcblo.slice(0, 3).toUpperCase())) || null;

/** Les affects pour lesquels un mail existe. */
export const AFFECTS_MAIL = Object.freeze(Object.keys(MAILS.destinataires));

function enTete(gcblo, type, objet) {
  if (!MAILS.destinataires[type]) throw new Error(`pas de mail prévu pour l'affect ${type || 'vide'}`);
  const boite = boitePour(gcblo);
  const avertissements = boite ? [] : [`${gcblo.slice(0, 3)} : ni LPC ni Aquitaine, aucune boîte BL en destinataire`];
  return { a: [...MAILS.destinataires[type], ...(boite ? [boite.adresse] : [])], cc: [...MAILS.copie], objet, boite, avertissements };
}

const TEXTES = {
  affectation: {
    NUM21: (gcblo, mention) => ['Bonjour,', '', `${mention}Merci d’affecter la ligne ${gcblo} à NUM21.`, '', '@NUM21 : Pouvez-vous nous fournir le numéro de commande.', '', 'Merci d’avance.'],
    AIR: (gcblo, mention) => ['Bonjour,', '', `${mention}Merci d’affecter la ligne ${gcblo} à AIR.`, '', '@Jérémie SANNIER : Peux-tu nous fournir le numéro de commande.', '', 'Merci d’avance.']
  },
  fci: {
    NUM21: () => ['Bonjour,', '', 'Je me permets de vous relancer.', 'Nous avons besoin du numéro de commande, pouvez-vous nous le fournir ?', '', 'Merci d’avance.'],
    AIR: () => ['Bonjour Jérémie,', '', 'Je me permets de te relancer.', 'Nous avons besoin du numéro de commande, peux-tu nous le fournir ?', '', 'Merci d’avance.']
  },
  dft: {
    NUM21: () => ['Bonjour,', '', 'Pouvez-vous réaliser le DFT du dossier en objet et mettre à disposition les docs GCB1 et GCB2 sur le LINE ?', '', 'Merci d’avance.'],
    AIR: () => ['Bonjour Jérémie,', '', 'Peux-tu réaliser le DFT du dossier en objet et mettre à disposition les docs GCB1 et GCB2 sur le LINE ?', '', 'Merci d’avance.']
  }
};

/**
 * Un GCBLO = un objet de mail, le même pour toute la vie du dossier : « GCBLO | SBA501404-THF010 | AIR »
 * (l'affect en fin d'objet ; une réaffectation ouvre un nouveau fil).
 * L'affectation l'ouvre ; les relances (FCI, DFT) répondent dessus (« RE: … »), comme une réponse :
 * Outlook range tout dans la même conversation, et une recherche sur le GCBLO dans l'objet retrouve tout.
 * Le texte du mail dit de quoi il s'agit (affectation, relance FCI, relance DFT).
 */
export const objetDossier = (gcblo, type) => `GCBLO | ${gcblo}${type ? ` | ${type}` : ''}`;

export function mailAffectation(gcblo, type) {
  const m = enTete(gcblo, type, objetDossier(gcblo, type));
  const mention = m.boite ? `${m.boite.mention} : ` : '';
  return { a: m.a, cc: m.cc, objet: m.objet, corps: TEXTES.affectation[type](gcblo, mention).join('\r\n'), avertissements: m.avertissements };
}

export function mailRelance(gcblo, type, motif) {
  if (!TEXTES[motif]) throw new Error(`relance inconnue : ${motif} (fci ou dft)`);
  const m = enTete(gcblo, type, `RE: ${objetDossier(gcblo, type)}`);
  return { a: m.a, cc: m.cc, objet: m.objet, corps: TEXTES[motif][type]().join('\r\n'), avertissements: m.avertissements };
}

/** Le lien qui ouvre le mail prêt dans la messagerie (Outlook…). Adresses séparées par « ; » comme dans Outlook. */
export function lienMailto({ a, cc, objet, corps }) {
  const params = [cc.length && `cc=${encodeURIComponent(cc.join(';'))}`, `subject=${encodeURIComponent(objet)}`, `body=${encodeURIComponent(corps)}`].filter(Boolean);
  return `mailto:${a.map(encodeURIComponent).join(';')}?${params.join('&')}`;
}

/**
 * R15 — Mail d'attachement au pôle facturation (la boîte BL), copie fixe + contact du partenaire.
 * Objet : « ATTACHEMENT GCBLO | SBA300497-THF010 | NUM21 ». L'attachement est joint par la macro Outlook.
 */
export function mailAttachement(gcblo, type) {
  const copiePartenaire = MAILS.attachement.copiePartenaire[type];
  if (!copiePartenaire) throw new Error(`pas de mail d'attachement pour l'affect ${type || 'vide'}`);
  const boite = boitePour(gcblo);
  const compte = /^[AEIOUY]/i.test(type) ? `d’${type}` : `de ${type}`;
  return {
    a: boite ? [boite.adresse] : [],
    cc: [...MAILS.copie, ...copiePartenaire],
    objet: `ATTACHEMENT ${objetDossier(gcblo, type)}`,
    corps: ['Bonjour,', '', 'Le GCBLO du dossier en objet a été réalisé et déposé sur le LINE.', '', `Vous trouverez en pièce jointe l’attachement pour le compte ${compte}.`, '', 'Merci d’avance.'].join('\r\n'),
    avertissements: boite ? [] : [`${gcblo.slice(0, 3)} : ni LPC ni Aquitaine, aucune boîte BL en destinataire`]
  };
}

/** Le fichier des mails d'attachement en attente, à côté des attachements ; la macro Outlook en fait des brouillons. */
export const NOM_CSV_MAILS = 'mails-attachement.csv';
const ENTETES_MAILS = 'GCBLO;FICHIER;A;CC;OBJET;CORPS';
const champ = t => String(t).replace(/[;\r\n]+/g, ' ').trim();

/**
 * Ajoute des mails (un par GCBLO : le plus récent remplace l'ancien) au texte existant de mails-attachement.csv.
 * mails : [{ gcblo, fichier, a, cc, objet, corps }]. Adresses séparées par un espace, lignes du texte par « \n ».
 */
export function csvMailsAttachement(existant, mails) {
  const lignes = new Map();
  for (const l of String(existant || '').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1)) {
    const g = l.split(';')[0].trim();
    if (g) lignes.set(g, l);
  }
  for (const m of mails) {
    lignes.set(m.gcblo, [m.gcblo, m.fichier, m.a.join(' '), m.cc.join(' '), m.objet, m.corps.split(/\r?\n/).join('\\n')].map(champ).join(';'));
  }
  return `\uFEFF${ENTETES_MAILS}\r\n${[...lignes.values()].map(l => `${l}\r\n`).join('')}`;
}
