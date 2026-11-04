/**
 * import-excel.js — R10 : quels dossiers prendre dans un classeur Excel.
 *
 * Fonction pure : elle reçoit le classeur déjà lu (xlsx.js) et la liste des
 * dossiers existants, et dit ce qu'il faudrait créer ou compléter. Elle ne
 * modifie rien : c'est la commande « import » qui passe par les règles.
 *
 * Réglages (onglets, colonnes, texte repère) : IMPORT_EXCEL dans config.js.
 *
 *   extraireDossiers(classeur, existants) → {
 *     lus,                                  lignes « GCBLO » trouvées
 *     nouveaux:  [{ gcblo, type (code, ou null si illisible), fci: [], commune, valorisation, onglet, ligne }],
 *     completes: [{ dossier, changements: { fci?, commune?, valorisation? } }],
 *                dossiers existants à compléter : FCI manquants, commune ou valorisation vides
 *     deja:      nombre de dossiers existants sans rien à ajouter,
 *     refuses:   [{ onglet, ligne, valeur, motif }],
 *     ongletsAbsents: ['17', …]
 *   }
 */
import { IMPORT_EXCEL, FORMATS } from './config.js';
import { normaliserGcblo, lireMontant } from './dossiers.js';

/** Échappe un texte pour l'utiliser dans une expression régulière. */
const motif = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');

/**
 * Le type écrit en colonne I → code (NUM21, AIR, SOGETREL), ou null s'il n'est pas reconnu.
 * Tolère « num21 », « NUM 21 », « Numérus 21 », « Air », « SOGETREL »…
 */
export function lireType(texte) {
  const t = String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s_-]+/g, '');
  if (/^NUM(ERUS)?21$/.test(t)) return 'NUM21';
  if (t === 'AIR') return 'AIR';
  if (t.startsWith('SOGE')) return 'SOGETREL';
  return null;
}

/** Sans accents, pour tolérer « Numero » comme « Numéro ». */
const sansAccents = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Le FCI écrit après le texte repère (« Numéro de commande FCI : F26154200726 ») ; '' s'il n'y en a pas.
 * Majuscules, accents et espaces autour des deux-points sont tolérés.
 */
export function lireFciApresRepere(texte, repere = IMPORT_EXCEL.reperFci) {
  const m = sansAccents(texte).match(new RegExp(`${motif(sansAccents(repere))}\\s*([^\\s,;]+)`, 'i'));
  return m ? m[1].toUpperCase() : '';
}

export function extraireDossiers(classeur, existants = [], reglages = IMPORT_EXCEL) {
  const { onglets, colonnes, valeurFiltre } = reglages;
  const parGcblo = new Map(existants.map(d => [d.gcblo, d]));
  const trouves = new Map();            // gcblo → { gcblo, fci: [], onglet, ligne }
  const refuses = [];
  let lus = 0;

  for (const onglet of onglets) {
    for (const { numero, cellules } of classeur.feuilles[onglet] || []) {
      if (String(cellules[colonnes.filtre] ?? '').trim().toUpperCase() !== valeurFiltre.toUpperCase()) continue;
      lus++;
      const brut = String(cellules[colonnes.dossier] ?? '').trim();
      const gcblo = normaliserGcblo(brut);
      if (!FORMATS.gcblo.test(gcblo)) { refuses.push({ onglet, ligne: numero, valeur: brut || '(vide)', motif: 'GCBLO non reconnu' }); continue; }
      const fci = lireFciApresRepere(cellules[colonnes.fci], reglages.reperFci);
      if (fci && !FORMATS.fci.test(fci)) refuses.push({ onglet, ligne: numero, valeur: fci, motif: 'FCI non reconnu' });   // le dossier est quand même importé, sans ce FCI
      // Le même dossier sur plusieurs lignes ou onglets : un seul dossier, tous ses FCI
      const t = trouves.get(gcblo) || { gcblo, type: null, typeLu: '', fci: [], commune: '', valorisation: null, onglet, ligne: numero };
      // Type : le premier lisible l'emporte ; un type illisible est signalé, le type sera demandé
      const typeLu = String(cellules[colonnes.type] ?? '').trim();
      if (!t.type) { t.type = lireType(typeLu); if (!t.type && typeLu) t.typeLu = typeLu; }
      if (fci && FORMATS.fci.test(fci) && !t.fci.includes(fci)) t.fci.push(fci);
      // Commune (G) et valorisation (H, en euros) : la première valeur non vide l'emporte
      const commune = String(cellules[colonnes.commune] ?? '').trim();
      if (!t.commune && commune) t.commune = commune;
      const valorisation = lireMontant(cellules[colonnes.valorisation]);
      if (Number.isNaN(valorisation)) refuses.push({ onglet, ligne: numero, valeur: String(cellules[colonnes.valorisation]), motif: 'valorisation non reconnue' });
      else if (t.valorisation === null && valorisation !== null) t.valorisation = valorisation;
      trouves.set(gcblo, t);
    }
  }

  const nouveaux = [], completes = [];
  let deja = 0;
  for (const t of trouves.values()) {
    const d = parGcblo.get(t.gcblo);
    if (!d) { nouveaux.push(t); continue; }
    // Dossier déjà présent : on complète ce qui manque, on ne remplace rien
    const changements = {};
    const manquants = t.fci.filter(f => !d.fci.includes(f));
    if (manquants.length) changements.fci = [...d.fci, ...manquants];
    if (!d.commune && t.commune) changements.commune = t.commune;
    if ((d.valorisation ?? null) === null && t.valorisation !== null) changements.valorisation = t.valorisation;
    if (Object.keys(changements).length) completes.push({ dossier: d, changements }); else deja++;
  }
  return { lus, nouveaux, completes, deja, refuses, ongletsAbsents: onglets.filter(o => !classeur.feuilles[o]) };
}

/**
 * Applique le résultat d'extraireDossiers : crée les nouveaux dossiers, complète les autres.
 * Utilisé par la commande « import » et par la lecture de classeur-gcblo.csv (R14).
 * Renvoie { crees: [dossiers], avant: [dossiers avant complément], refuses: [{ saisie, erreur }] }.
 */
export function appliquerImport(regles, r, origine = 'import Excel') {
  // Pas de date affect à l'import : elle viendra de la commande « affect » (ou d'une saisie)
  const creation = r.nouveaux.length
    ? regles.creerPlusieurs(r.nouveaux.map(n => ({ gcblo: n.gcblo, type: n.type || null, dateAffectation: null, fci: n.fci, commune: n.commune, valorisation: n.valorisation })), { origine })
    : { crees: [], refuses: [] };
  const avant = [];
  for (const c of r.completes) {
    const m = regles.modifier(c.dossier.id, c.changements);
    if (m.ok && m.avant) avant.push(m.avant);
  }
  return { crees: creation.crees, avant, refuses: creation.refuses };
}
