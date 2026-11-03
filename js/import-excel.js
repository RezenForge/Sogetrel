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
 *     nouveaux:  [{ gcblo, fci: [] , onglet, ligne }],
 *     completes: [{ dossier, fci: [manquants] }],      dossiers existants à qui il manque un FCI
 *     deja:      nombre de dossiers existants sans rien à ajouter,
 *     refuses:   [{ onglet, ligne, valeur, motif }],
 *     ongletsAbsents: ['17', …]
 *   }
 */
import { IMPORT_EXCEL, FORMATS } from './config.js';
import { normaliserGcblo } from './dossiers.js';

/** Échappe un texte pour l'utiliser dans une expression régulière. */
const motif = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');

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
      const t = trouves.get(gcblo) || { gcblo, fci: [], onglet, ligne: numero };
      if (fci && FORMATS.fci.test(fci) && !t.fci.includes(fci)) t.fci.push(fci);
      trouves.set(gcblo, t);
    }
  }

  const nouveaux = [], completes = [];
  let deja = 0;
  for (const t of trouves.values()) {
    const d = parGcblo.get(t.gcblo);
    if (!d) { nouveaux.push(t); continue; }
    const manquants = t.fci.filter(f => !d.fci.includes(f));
    if (manquants.length) completes.push({ dossier: d, fci: manquants }); else deja++;
  }
  return { lus, nouveaux, completes, deja, refuses, ongletsAbsents: onglets.filter(o => !classeur.feuilles[o]) };
}
