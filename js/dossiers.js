/**
 * dossiers.js — les règles métier.
 *
 * C'est le SEUL module qui modifie les dossiers. L'interface et Jarvis
 * l'appellent ; lui vérifie les règles, puis demande au store d'enregistrer.
 * Les numéros de règle (R1…R7) renvoient au §3 de FONDATION.md.
 *
 * Toutes les opérations qui modifient renvoient un résultat explicite :
 *   { ok: true, dossier, ... }      — c'est fait
 *   { ok: false, erreurs: {...} }   — refusé ; `erreurs` dit pourquoi, champ par champ
 * Rien n'est lancé en exception pour une saisie invalide : c'est un cas normal.
 *
 * Usage :
 *   const regles = creerDossiers(store);                       // en temps normal
 *   const regles = creerDossiers(store, { horloge: () => d }); // tests : heure fixe
 */
import { TYPES, STATUTS, STATUT_PAR_DEFAUT, FORMATS, RELANCE, EMAIL, typeParCode, statutParCode } from './config.js';
import { aujourdhui, ajouterJours, ecartJours, estJour, formater } from './dates.js';

/* ---------------- Lecture et nettoyage des saisies ---------------- */

/** « sba501404-thf010 » → « SBA501404-THF010 » (majuscules, sans espaces). */
export function normaliserGcblo(texte) {
  return String(texte ?? '').toUpperCase().replace(/\s+/g, '');
}

/**
 * Lit une saisie de FCI : liste ou texte libre (« F1, F2 », « F1 et F2 »).
 * « aucun », « - », « ? » ou un texte vide veulent dire : pas de FCI.
 * Renvoie { fci: [valides, sans doublon], invalides: [morceaux refusés] }.
 */
export function lireFci(saisie) {
  const texte = (Array.isArray(saisie) ? saisie.join(' ') : String(saisie ?? '')).trim();
  if (!texte || /^(aucun|aucune|-+|\?+)$/i.test(texte)) return { fci: [], invalides: [] };
  const morceaux = texte.toUpperCase().split(/[\s,;/]+|\bET\b/).filter(Boolean);
  const fci = [], invalides = [];
  for (const m of morceaux) {
    if (FORMATS.fci.test(m)) { if (!fci.includes(m)) fci.push(m); } else invalides.push(m);
  }
  return { fci, invalides };
}

/**
 * R2 / R3 — état d'alerte de relance d'un dossier, au jour donné : 'retard', 'proche' ou null.
 * Fonction pure, exportée : l'invite s'en sert aussi pour les groupes « retard » et « proches ».
 */
export function etatRelance(dossier, jour) {
  if (!dossier.dateRelance || statutParCode(dossier.statutDft)?.clos) return null;
  const ecart = ecartJours(dossier.dateRelance, jour);
  if (ecart < 0) return 'retard';
  if (ecart <= RELANCE.joursProches) return 'proche';
  return null;
}

const identifiant = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/* ---------------- Les règles ---------------- */

export function creerDossiers(store, { horloge = () => new Date() } = {}) {
  const jour = () => aujourdhui(horloge());
  const instant = () => horloge().toISOString();
  const entree = (action, detail) => ({ date: instant(), action, detail });

  /**
   * Vérifie une saisie complète et renvoie sa version propre.
   * `idExclu` : lors d'une modification, le dossier lui-même ne compte pas comme doublon.
   */
  function valider(saisie, { idExclu = null } = {}) {
    const erreurs = {};
    const gcblo = normaliserGcblo(saisie.gcblo);
    const { fci, invalides } = lireFci(saisie.fci);
    const statutDft = saisie.statutDft || STATUT_PAR_DEFAUT;
    const dateAffectation = saisie.dateAffectation || jour();
    const dateRelance = saisie.dateRelance || null;

    if (!typeParCode(saisie.type)) erreurs.type = `Type inconnu. Choisir parmi : ${TYPES.map(t => t.libelle).join(', ')}.`;
    if (!gcblo) erreurs.gcblo = 'Le GCBLO est obligatoire.';
    else if (!FORMATS.gcblo.test(gcblo)) erreurs.gcblo = 'Format attendu : AAA000000-AAA000 (ex. SBA501404-THF010).';
    else {
      // R1 — pas de doublon, quel que soit le type
      const existant = store.parGcblo(gcblo);
      if (existant && existant.id !== idExclu) erreurs.gcblo = `${gcblo} existe déjà (${typeParCode(existant.type)?.libelle}).`;
    }
    if (invalides.length) erreurs.fci = `FCI non reconnu : ${invalides.join(', ')}. Format attendu : F suivi de 11 chiffres.`;
    if (!statutParCode(statutDft)) erreurs.statutDft = `Statut inconnu. Choisir parmi : ${STATUTS.map(s => s.libelle).join(', ')}.`;
    if (!estJour(dateAffectation)) erreurs.dateAffectation = 'Date d\'affectation invalide.';
    if (dateRelance !== null && !estJour(dateRelance)) erreurs.dateRelance = 'Date de relance invalide.';

    const valeur = { type: saisie.type, gcblo, fci, dateAffectation, dateRelance, statutDft, commentaire: String(saisie.commentaire ?? '').trim() };
    return { ok: Object.keys(erreurs).length === 0, erreurs, valeur };
  }

  /** Décrit en français ce qui change entre deux versions (pour l'historique). */
  function differences(avant, apres) {
    const libelles = {
      type: ['Type', v => typeParCode(v)?.libelle],
      gcblo: ['GCBLO', v => v],
      fci: ['FCI', v => (v.length ? v.join(', ') : 'aucun')],
      dateAffectation: ['Affectation', formater],
      dateRelance: ['Relance', v => (v ? formater(v) : 'aucune')],
      statutDft: ['Statut DFT', v => statutParCode(v)?.libelle],
      commentaire: ['Commentaire', v => (v ? `« ${v.length > 40 ? v.slice(0, 40) + '…' : v} »` : 'vide')]
    };
    return Object.entries(libelles)
      .filter(([champ]) => JSON.stringify(avant[champ]) !== JSON.stringify(apres[champ]))
      .map(([champ, [nom, lire]]) => `${nom} : ${lire(avant[champ])} → ${lire(apres[champ])}`);
  }

  /** Prépare la nouvelle version d'un dossier, sans l'enregistrer. */
  function preparerModification(id, changements) {
    const actuel = store.parId(id);
    if (!actuel) return { ok: false, erreurs: { id: 'Dossier introuvable.' } };
    const { ok, erreurs, valeur } = valider({ ...actuel, ...changements }, { idExclu: id });
    if (!ok) return { ok: false, erreurs };
    const liste = differences(actuel, valeur);
    if (!liste.length) return { ok: true, inchange: true, dossier: actuel };
    const date = instant();
    // R6 — chaque changement ajoute une ligne d'historique
    const dossier = { ...actuel, ...valeur, modifieLe: date, historique: [...actuel.historique, { date, action: 'modification', detail: liste.join(' · ') }] };
    return { ok: true, dossier, avant: actuel };
  }

  return {
    valider,
    /** R2 / R3 — voir etatRelance() plus haut ; par défaut, au jour d'aujourd'hui. */
    etatRelance: (dossier, reference = jour()) => etatRelance(dossier, reference),

    /** Crée un dossier. Le type est obligatoire ; le reste a des valeurs par défaut. */
    creer(saisie) {
      const { ok, erreurs, valeur } = valider(saisie);
      if (!ok) return { ok: false, erreurs };
      const date = instant();
      const dossier = { id: identifiant(), ...valeur, creeLe: date, modifieLe: date, historique: [{ date, action: 'creation', detail: 'Dossier créé' }] };
      store.ajouter(dossier);
      return { ok: true, dossier: store.parId(dossier.id) };
    },

    /**
     * R9 — crée plusieurs dossiers en un seul enregistrement. Chaque saisie est
     * validée comme une création normale ; un GCBLO présent deux fois dans le lot
     * n'est créé qu'une fois. Renvoie { crees, refuses: [{ saisie, erreur }] }.
     */
    creerPlusieurs(saisies) {
      const date = instant();
      const crees = [], refuses = [], vus = new Set();
      for (const saisie of saisies) {
        const { ok, erreurs, valeur } = valider(saisie);
        if (!ok) { refuses.push({ saisie, erreur: Object.values(erreurs)[0] }); continue; }
        if (vus.has(valeur.gcblo)) { refuses.push({ saisie, erreur: `${valeur.gcblo} est en double dans la liste` }); continue; }
        vus.add(valeur.gcblo);
        crees.push({ id: identifiant(), ...valeur, creeLe: date, modifieLe: date, historique: [{ date, action: 'creation', detail: 'Dossier créé (liste collée)' }] });
      }
      if (crees.length) store.ajouter(...crees);
      return { crees: crees.map(d => store.parId(d.id)), refuses };
    },

    /** Modifie un dossier. `changements` ne contient que les champs à changer. */
    modifier(id, changements) {
      const r = preparerModification(id, changements);
      if (!r.ok || r.inchange) return r;
      store.remplacer(r.dossier);
      return { ok: true, dossier: store.parId(id), avant: r.avant };
    },

    /**
     * Applique les mêmes changements à plusieurs dossiers, en un seul
     * enregistrement. Tout ou rien : si un seul dossier refuse, aucun n'est modifié.
     */
    modifierPlusieurs(ids, changements) {
      const prepares = ids.map(id => ({ id, ...preparerModification(id, changements) }));
      const refus = prepares.filter(p => !p.ok);
      if (refus.length) return { ok: false, erreurs: Object.fromEntries(refus.map(p => [p.id, Object.values(p.erreurs)[0]])) };
      const changes = prepares.filter(p => !p.inchange);
      if (changes.length) store.remplacer(...changes.map(p => p.dossier));
      return { ok: true, modifies: changes.length, inchanges: prepares.length - changes.length, avant: changes.map(p => p.avant) };
    },

    /** R7 — supprime. Renvoie les dossiers retirés pour pouvoir annuler (restaurer). */
    supprimer(...ids) {
      const retires = ids.map(id => store.parId(id)).filter(Boolean);
      if (!retires.length) return { ok: false, erreurs: { id: 'Dossier introuvable.' } };
      store.retirer(...retires.map(d => d.id));
      return { ok: true, retires };
    },

    /** Annule une suppression ou une modification : remet les versions données telles quelles. */
    restaurer(versions) {
      const existants = versions.filter(v => store.parId(v.id));
      const absents = versions.filter(v => !store.parId(v.id));
      if (existants.length) store.remplacer(...existants);
      if (absents.length) store.ajouter(...absents);
      return { ok: true, restaures: versions.length };
    },

    /** R4 + R6 — note dans l'historique qu'un email de relance a été préparé. */
    noterRelance(id) {
      const actuel = store.parId(id);
      if (!actuel) return { ok: false, erreurs: { id: 'Dossier introuvable.' } };
      const e = entree('relance', 'Email de relance préparé');
      store.remplacer({ ...actuel, modifieLe: e.date, historique: [...actuel.historique, e] });
      return { ok: true, dossier: store.parId(id) };
    },

    /** R4 + R6 — même chose pour plusieurs dossiers, en un seul enregistrement. */
    noterRelances(ids) {
      const e = entree('relance', 'Email de relance préparé (groupé)');
      const versions = ids.map(id => store.parId(id)).filter(Boolean).map(d => ({ ...d, modifieLe: e.date, historique: [...d.historique, e] }));
      if (versions.length) store.remplacer(...versions);
      return { ok: true, notes: versions.length };
    },

    /** R5 — planifie la relance suivante à J + délai. Le statut DFT ne change pas. */
    planifierRelanceSuivante(id, delai = RELANCE.delaiSuivante) {
      return this.modifier(id, { dateRelance: ajouterJours(jour(), delai) });
    },

    /** Le jour d'aujourd'hui selon l'horloge des règles (« AAAA-MM-JJ »). */
    aujourdhui: () => jour(),

    /** Date de la relance suivante (aujourd'hui + délai). */
    jourRelanceSuivante(delai = RELANCE.delaiSuivante) { return ajouterJours(jour(), delai); },

    /** R4 — objet et corps de l'email de relance (un dossier, ou plusieurs en un seul email). */
    email(dossierOuListe) {
      const liste = Array.isArray(dossierOuListe) ? dossierOuListe : [dossierOuListe];
      return liste.length === 1
        ? { objet: EMAIL.objet(liste[0]), corps: EMAIL.corps(liste[0]) }
        : { objet: EMAIL.objetGroupe(liste), corps: EMAIL.corpsGroupe(liste) };
    },

    /** R8 — le point du jour : quatre listes, triées par date de relance. */
    pointDuJour(liste = store.tous()) {
      const ref = jour();
      const parRelance = (a, b) => (a.dateRelance || '').localeCompare(b.dateRelance || '') || a.gcblo.localeCompare(b.gcblo);
      const ouverts = liste.filter(d => !statutParCode(d.statutDft)?.clos);
      return {
        retard: ouverts.filter(d => etatRelance(d, ref) === 'retard').sort(parRelance),
        aujourdhui: ouverts.filter(d => d.dateRelance === ref).sort(parRelance),
        proches: ouverts.filter(d => etatRelance(d, ref) === 'proche' && d.dateRelance !== ref).sort(parRelance),
        refuses: ouverts.filter(d => d.statutDft === 'REFUSE').sort((a, b) => a.gcblo.localeCompare(b.gcblo))
      };
    },

    /**
     * Filtre la liste. Tous les critères sont facultatifs et se cumulent :
     *   { texte, type, statut, retard: bool, sansFci: bool }
     * `texte` cherche dans le GCBLO, les FCI et le commentaire (sans tenir compte
     * des majuscules, des accents ni des tirets).
     */
    filtrer({ texte = '', type = '', statut = '', retard = false, sansFci = false } = {}, liste = store.tous()) {
      const plat = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, '');
      const mots = plat(texte).split(/\s+/).filter(Boolean);
      const ref = jour();
      return liste.filter(d =>
        (!type || d.type === type) &&
        (!statut || d.statutDft === statut) &&
        (!retard || etatRelance(d, ref) === 'retard') &&
        (!sansFci || d.fci.length === 0) &&
        mots.every(m => plat(`${d.gcblo} ${d.fci.join(' ')} ${d.commentaire}`).includes(m)));
    },

    /**
     * Trie une liste. `cle` : gcblo, type, statutDft, dateAffectation, dateRelance.
     * Les dossiers sans date de relance vont toujours à la fin.
     */
    trier(liste, { cle = 'dateAffectation', sens = 'desc' } = {}) {
      const ordre = {
        type: d => TYPES.findIndex(t => t.code === d.type),
        statutDft: d => STATUTS.findIndex(s => s.code === d.statutDft)
      };
      const valeur = ordre[cle] || (d => d[cle] ?? null);
      const signe = sens === 'asc' ? 1 : -1;
      return [...liste].sort((a, b) => {
        const x = valeur(a), y = valeur(b);
        if (x === null && y !== null) return 1;
        if (y === null && x !== null) return -1;
        const c = typeof x === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'fr', { numeric: true });
        return c * signe || a.gcblo.localeCompare(b.gcblo);
      });
    },

    /** Les chiffres du tableau de bord. */
    statistiques(liste = store.tous()) {
      const ref = jour();
      const parType = Object.fromEntries(TYPES.map(t => [t.code, 0]));
      const parStatut = Object.fromEntries(STATUTS.map(s => [s.code, 0]));
      let retard = 0, proche = 0, sansFci = 0;
      const aVenir = [0, 0, 0, 0, 0, 0, 0];   // relances prévues aujourd'hui, demain… J+6 (dossiers non clos)
      for (const d of liste) {
        parType[d.type]++;
        parStatut[d.statutDft]++;
        const e = etatRelance(d, ref);
        if (e === 'retard') retard++; else if (e === 'proche') proche++;
        if (!d.fci.length) sansFci++;
        if (d.dateRelance && !statutParCode(d.statutDft)?.clos) {
          const ecart = ecartJours(d.dateRelance, ref);
          if (ecart >= 0 && ecart < 7) aVenir[ecart]++;
        }
      }
      return { total: liste.length, parType, parStatut, retard, proche, sansFci, aVenir };
    }
  };
}
