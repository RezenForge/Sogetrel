/**
 * grammaire.js — le vocabulaire du terminal, sous forme de tableaux.
 *
 * C'est la source unique : l'analyse (analyse.js) ET l'autocomplétion
 * (completion.js) lisent ces mêmes tableaux. Ajouter une commande ici suffit
 * pour qu'elle soit comprise, proposée et documentée dans « aide ».
 *
 * Une commande = des verbes (le premier est le nom affiché) + une liste
 * d'emplacements, remplis dans l'ordre :
 *   { nom, sorte, optionnel?, multiple? }   une valeur à saisir
 *   { mot: 'en' }                            un mot de liaison (proposé automatiquement)
 *
 * Les « sortes » de valeurs sont décrites dans SORTES ci-dessous.
 */

export const COMMANDES = Object.freeze([
  { id: 'ls', verbes: ['ls', 'liste', 'montre'], resume: 'affiche les dossiers (filtres facultatifs)',
    forme: 'ls [type] [statut] [retard] [sans-fci] [texte]',
    emplacements: [{ nom: 'filtres', sorte: 'filtre', optionnel: true, multiple: true }] },
  { id: 'ajoute', verbes: ['ajoute', 'add'], resume: 'crée un dossier',
    forme: 'ajoute ‹gcblo› ‹type› [fci…]',
    emplacements: [{ nom: 'gcblo', sorte: 'nouveau-gcblo' }, { nom: 'type', sorte: 'type' }, { nom: 'fci', sorte: 'fci', optionnel: true, multiple: true }] },
  { id: 'passe', verbes: ['passe'], resume: 'change le statut DFT ou le type',
    forme: 'passe ‹dossiers› en ‹statut|type›',
    emplacements: [{ nom: 'cibles', sorte: 'dossier', multiple: true }, { mot: 'en' }, { nom: 'valeur', sorte: 'statut-ou-type' }] },
  { id: 'relance', verbes: ['relance'], resume: 'prépare l\'email ; avec une date, planifie la relance',
    forme: 'relance ‹dossier› [date]',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }, { nom: 'date', sorte: 'date', optionnel: true }] },
  { id: 'fci', verbes: ['fci'], resume: 'ajoute des FCI à un dossier',
    forme: 'fci ‹dossier› ‹fci…›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }, { nom: 'fci', sorte: 'fci', multiple: true }] },
  { id: 'note', verbes: ['note'], resume: 'ajoute une note au dossier',
    forme: 'note ‹dossier› ‹texte›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }, { nom: 'texte', sorte: 'texte' }] },
  { id: 'ouvre', verbes: ['ouvre', 'cat'], resume: 'affiche la fiche complète d\'un dossier',
    forme: 'ouvre ‹dossier›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }] },
  { id: 'supprime', verbes: ['supprime', 'rm'], resume: 'supprime des dossiers (confirmation demandée)',
    forme: 'supprime ‹dossiers›',
    emplacements: [{ nom: 'cibles', sorte: 'dossier', multiple: true }] },
  { id: 'stats', verbes: ['stats'], resume: 'compteurs par type, statut et alertes', forme: 'stats', emplacements: [] },
  { id: 'annule', verbes: ['annule', 'undo'], resume: 'annule la dernière modification', forme: 'annule', emplacements: [] },
  { id: 'sauvegarde', verbes: ['sauvegarde'], resume: 'télécharge une sauvegarde JSON', forme: 'sauvegarde', emplacements: [] },
  { id: 'restaure', verbes: ['restaure'], resume: 'recharge une sauvegarde JSON', forme: 'restaure', emplacements: [] },
  { id: 'clear', verbes: ['clear', 'cls'], resume: 'vide l\'écran', forme: 'clear', emplacements: [] },
  { id: 'aide', verbes: ['aide', 'help', '?'], resume: 'liste les commandes, ou détaille l\'une d\'elles',
    forme: 'aide [commande]',
    emplacements: [{ nom: 'sujet', sorte: 'commande', optionnel: true }] }
]);

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
export const MOTS_FILTRE = Object.freeze({ retard: 'retard', 'en-retard': 'retard', 'sans-fci': 'sansFci', sansfci: 'sansFci' });

/** Jours de la semaine, dimanche = 0 (comme Date.getDay). */
export const JOURS = Object.freeze(['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']);

/** Ce que veut dire chaque « sorte » d'emplacement (affiché dans l'aide). */
export const SORTES = Object.freeze({
  dossier: 'un GCBLO complet ou un morceau (ex. 501404)',
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
