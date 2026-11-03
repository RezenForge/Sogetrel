/**
 * grammaire.js — le vocabulaire du terminal, sous forme de tableaux.
 *
 * C'est la source unique : l'analyse (analyse.js) ET l'autocomplétion
 * (completion.js) lisent ces mêmes tableaux. Ajouter une commande ici suffit
 * pour qu'elle soit comprise et proposée pendant la frappe.
 *
 * Une commande = des verbes (le premier est le nom affiché) + une liste
 * d'emplacements, remplis dans l'ordre :
 *   { nom, sorte, optionnel?, multiple? }   une valeur à saisir
 *   { mot: 'en' }                            un mot de liaison (proposé automatiquement)
 *
 * Les « sortes » de valeurs sont décrites dans SORTES ci-dessous.
 */

/*
 * Vide depuis le 03/11/2026 : les commandes sont refaites une par une.
 * Exemple d'une commande :
 *   { id: 'passe', verbes: ['passe'], resume: 'change le statut DFT',
 *     forme: 'passe ‹dossiers› en ‹statut›',
 *     emplacements: [{ nom: 'cibles', sorte: 'dossier', multiple: true }, { mot: 'en' }, { nom: 'valeur', sorte: 'statut-ou-type' }] }
 */
export const COMMANDES = Object.freeze([]);

/**
 * Mots acceptés pour les statuts DFT et les types. La clé est la forme
 * « propre » (sans accents, avec tirets) ; le premier mot de chaque code est
 * celui que l'autocomplétion propose.
 */
export const MOTS_STATUT = Object.freeze({
  'a-faire': 'A_FAIRE', afaire: 'A_FAIRE',
  'en-validation': 'EN_VALIDATION', validation: 'EN_VALIDATION', 'en-cours': 'EN_VALIDATION',
  'mis-a-dispo': 'MAD', 'mis-a-disposition': 'MAD', mad: 'MAD', dispo: 'MAD',
  refuse: 'REFUSE', refus: 'REFUSE'
});
export const MOTS_TYPE = Object.freeze({ num21: 'NUM21', air: 'AIR', sogetrel: 'SOGETREL' });
/** Périodes (jour, demain, semaine). */
export const PERIODES = Object.freeze({ jour: 'jour', aujourdhui: 'jour', demain: 'demain', semaine: 'semaine', '7j': 'semaine' });

/** Groupes de dossiers utilisables à la place d'une référence (là où plusieurs dossiers sont acceptés). */
export const GROUPES = Object.freeze({ retard: 'retard', proches: 'proche' });
export const MOTS_FILTRE = Object.freeze({ retard: 'retard', 'en-retard': 'retard', 'sans-fci': 'sansFci', sansfci: 'sansFci' });

/** Jours de la semaine, dimanche = 0 (comme Date.getDay). */
export const JOURS = Object.freeze(['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']);

/** Ce que veut dire chaque « sorte » d'emplacement (affiché dans l'aide). */
export const SORTES = Object.freeze({
  dossier: 'un GCBLO complet ou un morceau (ex. 501404) ; là où plusieurs sont permis : retard, proches',
  adresse: 'une adresse email, ou « aucun » pour l\'effacer',
  ville: 'un nom de ville (plusieurs mots possibles : le taillan medoc)',
  periode: 'jour (par défaut), demain ou semaine',
  'nouveau-gcblo': 'un GCBLO au format AAA000000-AAA000',
  type: 'num21, air ou sogetrel',
  'statut-ou-type': 'a-faire, en-validation, mis-a-dispo, refuse — ou un type',
  filtre: 'un type, un statut, retard, sans-fci ou un texte à chercher',
  date: 'demain, lundi…, +3 (dans 3 jours), 12/11 ou 12/11/2026',
  fci: 'F suivi de 11 chiffres',
  texte: 'du texte libre',
  commande: 'le nom d\'une commande'
});

/* ---------------- Aides de lecture ---------------- */

/** Forme comparable d'un mot : minuscules, sans accents, espaces → tirets. */
export const plat = mot => String(mot ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

/** La commande désignée par un verbe exact, ou null. */
export const commandeParVerbe = verbe => COMMANDES.find(c => c.verbes.includes(plat(verbe))) || null;

/** Le mot proposé pour un code de statut ou de type (le premier de la liste). */
export const motPourCode = (table, code) => Object.keys(table).find(k => table[k] === code);
