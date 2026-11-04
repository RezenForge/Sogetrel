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
 *   { mot: 'to' }                            un mot de liaison (proposé automatiquement)
 *
 * Les « sortes » de valeurs sont décrites dans SORTES ci-dessous.
 */

/*
 * Refaites une par une depuis le 03/11/2026 (l'ancienne liste est dans la branche « v2-commandes »).
 * Verbes en anglais (choix du 03/11/2026) ; messages et valeurs (statuts, types) en français.
 * Chaque commande a sa fonction du même id dans actions.js.
 */
export const COMMANDES = Object.freeze([
  { id: 'ls', verbes: ['ls', 'list'], resume: 'liste les dossiers',
    forme: 'ls [affect] [statut] [date] [retard|proches] [sans-fci|fci-retard] [sans-valo] [sans-affect] [texte]',
    emplacements: [{ nom: 'filtres', sorte: 'filtre', optionnel: true, multiple: true }] },
  { id: 'open', verbes: ['open'], resume: 'fiche d\'un dossier',
    forme: 'open ‹dossier›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }] },
  { id: 'set', verbes: ['set'], resume: 'change statut ou affect',
    forme: 'set ‹dossiers› to ‹statut|affect›',
    emplacements: [{ nom: 'cibles', sorte: 'dossier', multiple: true }, { mot: 'to' }, { nom: 'valeur', sorte: 'statut-ou-type' }] },
  { id: 'affect', verbes: ['affect'], resume: 'affecte un GCBLO et prépare le mail',
    forme: 'affect ‹GCBLO› ‹num21|air|sogetrel›',
    emplacements: [{ nom: 'cible', sorte: 'gcblo' }, { nom: 'affect', sorte: 'type' }] },
  { id: 'relance', verbes: ['relance'], resume: 'prépare un mail de relance',
    forme: 'relance ‹dossier› ‹fci|dft›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }, { nom: 'motif', sorte: 'motif-relance' }] },
  { id: 'edit', verbes: ['edit'], resume: 'modifie un champ d\'un dossier',
    forme: 'edit ‹dossier› ‹champ› ‹valeur›',
    emplacements: [{ nom: 'cible', sorte: 'dossier' }, { nom: 'champ', sorte: 'champ' }, { nom: 'valeur', sorte: 'texte' }] },
  { id: 'delete', verbes: ['delete', 'rm'], resume: 'supprime',
    forme: 'delete ‹dossiers›',
    emplacements: [{ nom: 'cibles', sorte: 'dossier', multiple: true }] },
  { id: 'import', verbes: ['import'], resume: 'importe un classeur Excel', forme: 'import', emplacements: [] },
  { id: 'attachement', verbes: ['attachement'], resume: 'crée les attachements de dossiers',
    forme: 'attachement ‹dossiers|*|statut|fichier›',
    emplacements: [{ nom: 'cibles', sorte: 'attachement', multiple: true }] },
  { id: 'sauvegarde', verbes: ['sauvegarde'], resume: 'sauvegarde la base dans un dossier', forme: 'sauvegarde [dossier]',
    emplacements: [{ nom: 'option', sorte: 'option-sauvegarde', optionnel: true }] },
  { id: 'restore', verbes: ['restore'], resume: 'recharge une sauvegarde', forme: 'restore', emplacements: [] },
  { id: 'cancel', verbes: ['cancel', 'undo'], resume: 'annule la dernière action', forme: 'cancel', emplacements: [] },
  { id: 'clear', verbes: ['clear', 'cls'], resume: 'vide l\'écran', forme: 'clear', emplacements: [] },
  { id: 'help', verbes: ['help', '?'], resume: 'aide',
    forme: 'help [commande]',
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
  refuse: 'REFUSE', refus: 'REFUSE',
  litige: 'LITIGE', annule: 'ANNULE', attach: 'ATTACH', attache: 'ATTACH'
});
export const MOTS_TYPE = Object.freeze({ num21: 'NUM21', air: 'AIR', sogetrel: 'SOGETREL' });
/** Périodes (jour, demain, semaine). */
export const PERIODES = Object.freeze({ jour: 'jour', aujourdhui: 'jour', demain: 'demain', semaine: 'semaine', '7j': 'semaine' });

/** Groupes de dossiers utilisables à la place d'une référence (là où plusieurs dossiers sont acceptés). */
export const GROUPES = Object.freeze({ retard: 'retard', proches: 'proche' });
export const MOTS_FILTRE = Object.freeze({ retard: 'retard', 'en-retard': 'retard', proches: 'proche', 'sans-fci': 'sansFci', sansfci: 'sansFci', 'fci-retard': 'fciRetard', 'sans-valo': 'sansValo', sansvalo: 'sansValo', 'sans-affect': 'sansAffect', 'ecart-affect': 'ecartAffect' });

/**
 * Champs modifiables avec « edit » (et au double-clic dans une fiche) : mot affiché → champ du dossier.
 * Pour vider un champ facultatif : « - », « aucun » ou « vide » comme valeur.
 */
export const CHAMPS = Object.freeze({
  affect: 'type', statut: 'statutDft', commune: 'commune', valo: 'valorisation', fci: 'fci',
  date: 'dateAffectation', affectation: 'dateAffectation', relance: 'dateRelance', commentaire: 'commentaire', gcblo: 'gcblo'
});

/** Jours de la semaine, dimanche = 0 (comme Date.getDay). */
export const JOURS = Object.freeze(['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']);

/** Ce que veut dire chaque « sorte » d'emplacement (affiché dans l'aide). */
export const SORTES = Object.freeze({
  dossier: 'GCBLO ou morceau (501404), retard, proches, * (la liste affichée)',
  adresse: 'email ou aucun',
  ville: 'nom de ville',
  periode: 'jour, demain, semaine',
  'nouveau-gcblo': 'AAA000000-AAA000',
  type: 'num21, air ou sogetrel',
  'statut-ou-type': 'a-faire, en-validation, mis-a-dispo, refuse, litige, annule, attach, ou un affect',
  filtre: 'affect, statut, date (12/03, 12/03/2026, 03/2026), retard, proches, sans-fci, fci-retard, sans-valo, sans-affect, texte',
  date: 'demain, lundi, +3, 12/11',
  fci: 'F + 11 chiffres',
  texte: 'texte libre',
  commande: 'une commande',
  gcblo: 'GCBLO existant ou nouveau (créé), ou morceau d\'un existant',
  'motif-relance': 'fci (numéro de commande) ou dft',
  'option-sauvegarde': '« dossier » pour choisir un autre dossier de sauvegarde',
  champ: 'date, affect, statut, commune, valo, fci, relance, commentaire, gcblo',
  'dossier-ou-fichier': 'un dossier, ou « fichier » pour choisir la référence',
  attachement: 'des dossiers, * (la liste affichée), un statut (tous ses dossiers), ou « fichier » pour choisir la référence'
});

/* ---------------- Aides de lecture ---------------- */

/** Forme comparable d'un mot : minuscules, sans accents, espaces → tirets. */
export const plat = mot => String(mot ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

/** La commande désignée par un verbe exact, ou null. */
export const commandeParVerbe = verbe => COMMANDES.find(c => c.verbes.includes(plat(verbe))) || null;

/** Le mot proposé pour un code de statut ou de type (le premier de la liste). */
export const motPourCode = (table, code) => Object.keys(table).find(k => table[k] === code);
