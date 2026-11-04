/**
 * config.js — les listes et réglages du métier.
 *
 * Tout ce qui décrit le métier (types, statuts DFT, formats, délais, modèle
 * d'email) est déclaré ici, et nulle part ailleurs. Le reste du code lit ces
 * valeurs au lieu de les écrire en dur.
 *
 * Utilisé par : dossiers.js (règles), puis l'invite et l'affichage.
 */

/** Types de dossiers, dans l'ordre d'affichage. */
export const TYPES = Object.freeze([
  { code: 'NUM21', libelle: 'NUM21' },
  { code: 'AIR', libelle: 'AIR' },
  { code: 'SOGETREL', libelle: 'Sogetrel' }
]);

/**
 * Statuts DFT. `clos: true` signifie que le dossier est terminé :
 * il n'a plus d'alerte de relance (règle 2 et 3 de la fondation).
 */
export const STATUTS = Object.freeze([
  { code: 'A_FAIRE', libelle: 'À faire', clos: false },
  { code: 'EN_VALIDATION', libelle: 'En cours de validation', clos: false },
  { code: 'MAD', libelle: 'Mis à disposition', clos: true },
  { code: 'REFUSE', libelle: 'Refusé', clos: false },
  { code: 'LITIGE', libelle: 'Litige', clos: false },
  { code: 'ANNULE', libelle: 'Annulé', clos: true },
  { code: 'ATTACH', libelle: 'Attach', clos: true }           // attachement fait : la ligne est surlignée en vert clair
]);

export const STATUT_PAR_DEFAUT = 'A_FAIRE';

/** Formats acceptés. */
export const FORMATS = Object.freeze({
  gcblo: /^[A-Z]{3}\d{6}-[A-Z]{3}\d{3}$/,   // ex. SBA501404-THF010
  fci: /^F\d{11}$/                          // ex. F26154200726
});

/** Délais de relance, en jours. */
export const RELANCE = Object.freeze({
  joursProches: 3,      // « relance proche » : aujourd'hui ou dans les 3 jours
  delaiSuivante: 7      // relance suivante proposée à J+7
});

/** Modèle de l'email de relance (règle 4). */
export const EMAIL = Object.freeze({
  objet: dossier => `Relance dossier ${dossier.gcblo}`,
  corps: dossier => [
    'Bonjour,',
    '',
    `Je reviens vers vous concernant le dossier ${dossier.gcblo}.`,
    '',
    `FCI : ${dossier.fci.length ? dossier.fci.join(', ') : 'aucun'}`,
    '',
    'Merci pour votre retour.',
    '',
    'Cordialement'
  ].join('\n'),
  /** Relance groupée : un seul email pour plusieurs dossiers. */
  objetGroupe: dossiers => `Relance dossiers (${dossiers.length})`,
  corpsGroupe: dossiers => [
    'Bonjour,',
    '',
    'Je reviens vers vous concernant les dossiers suivants :',
    '',
    ...dossiers.map(d => `- ${d.gcblo} — FCI : ${d.fci.length ? d.fci.join(', ') : 'aucun'}`),
    '',
    'Merci pour votre retour.',
    '',
    'Cordialement'
  ].join('\n')
});

/**
 * R10 — Import Excel : où lire les dossiers dans le classeur.
 * Une ligne est prise si sa colonne `filtre` vaut `valeurFiltre` ;
 * la commune et la valorisation (en euros) dans les colonnes `commune` et `valorisation` ;
 * le type (NUM21, AIR, Sogetrel) est dans la colonne `type` ;
 * le FCI est le mot qui suit `reperFci` dans la colonne `fci`.
 */
export const IMPORT_EXCEL = Object.freeze({
  onglets: Object.freeze(['33', '16', '17', '79', '86']),
  colonnes: Object.freeze({ dossier: 'D', filtre: 'E', commune: 'G', valorisation: 'H', type: 'I', fci: 'J' }),
  valeurFiltre: 'GCBLO',
  reperFci: 'Numéro de commande FCI :'
});

/**
 * R11 — Attachement : cellules à remplir dans la copie du classeur de référence
 * (sur sa première feuille), et paliers cochés selon la valorisation du dossier.
 * Un palier est retenu si la valorisation est à `ecartMax` au plus de sa cible ;
 * entre deux paliers, le plus proche l'emporte.
 */
export const ATTACHEMENT = Object.freeze({
  cellules: Object.freeze({ commune: 'X5', date: 'AG5', gcblo: 'U6' }),
  ecartMax: 15,
  paliers: Object.freeze([
    Object.freeze({ cible: 30, nom: 'ANNEX', cellules: Object.freeze({ A30: 'ANNEX', AB30: 1 }) }),
    Object.freeze({ cible: 60, nom: 'ANNEX + BLOCS', cellules: Object.freeze({ A30: 'ANNEX', AB30: 1, A31: 'BLOCS', AB31: 1 }) })
  ])
});

/** Sauvegarde automatique : toutes les N heures, tant que l'appli est ouverte (dans le dernier dossier choisi). */
export const SAUVEGARDE_AUTO_HEURES = 3;

/** Où et sous quelle version les données sont enregistrées dans le navigateur. */
export const STOCKAGE = Object.freeze({
  cle: 'gcblo.v2.dossiers',
  version: 1
});

/* Petites aides de lecture, pour ne pas répéter les recherches dans les listes. */
export const typeParCode = code => TYPES.find(t => t.code === code) || null;
export const statutParCode = code => STATUTS.find(s => s.code === code) || null;
