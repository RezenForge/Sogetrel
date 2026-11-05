/**
 * dossiers-lies.js — les « dossiers liés » d'un GCBLO, lus dans le classeur partagé.
 *
 * Un GCBLO (ex. SBA301460-THF010) peut avoir dans le classeur d'autres lignes de la même affaire :
 * même début (SBA301460), autre suffixe (SBA301460-ACD010…), avec leur propre affect (I), valo (H),
 * statut (E) et commentaire (J). Le registre les retient à chaque lecture de classeur-gcblo.csv
 * pour les montrer : colonne LIÉS des listes (valo totale, en couleur selon l'enjeu), carte dans la
 * fiche, carte « Gros enjeux liés » de today, tri `tri:lies`, filtre `ls lies`.
 *
 * Gardé dans ce navigateur (localStorage), à part des dossiers : remplacé en entier à chaque lecture.
 *
 *   extraireLies(classeur, gcblos) → { 'SBA301460': [{ dossier, statut, affect, valo, commentaire, onglet, ligne }] }
 *   lireLies() / noterLies(lies)
 *   liesDe(d, lies) → liste triée par valo décroissante ; totalLies(d, lies) → somme des valos (null si aucune)
 *   chaleurs(dossiers, lies) → { moyen, fort } : seuils (valos totales du top 30 % et du top 10 %)
 */
import { IMPORT_EXCEL } from './config.js';
import { lireMontant } from './dossiers.js';

const CLE = 'gcblo.v2.dossiersLies';
/** Le début d'affaire commun : 3 lettres + 6 chiffres (« SBA301460 »). */
export const prefixe = texte => (String(texte ?? '').toUpperCase().replace(/[\s ]/g, '').match(/^[A-Z]{3}-?\d{6}/)?.[0] || '').replace('-', '');

export function extraireLies(classeur, gcblos, reglages = IMPORT_EXCEL) {
  const { onglets, colonnes } = reglages;
  const connus = new Set([...gcblos].map(g => String(g).toUpperCase()));
  const prefixes = new Set([...connus].map(prefixe).filter(Boolean));
  const lies = {};
  const vus = new Set();
  for (const onglet of onglets) {
    for (const { numero, cellules } of classeur.feuilles[onglet] || []) {
      const brut = String(cellules[colonnes.dossier] ?? '').trim();
      const dossier = brut.toUpperCase().replace(/[\s ]/g, '').replace(/[‐‑‒–—]/g, '-');
      const p = prefixe(dossier);
      if (!p || !prefixes.has(p) || connus.has(dossier)) continue;
      const statut = String(cellules[colonnes.filtre] ?? '').trim();
      if (statut.toUpperCase() === (reglages.valeurFiltre || 'GCBLO').toUpperCase()) continue;     // un GCBLO, pas un dossier lié
      // Le même dossier lié sur plusieurs lignes ou onglets : une seule fois (la première ligne)
      if (vus.has(dossier)) continue;
      vus.add(dossier);
      const valo = lireMontant(cellules[colonnes.valorisation]);
      (lies[p] ||= []).push({
        dossier, statut, affect: String(cellules[colonnes.type] ?? '').trim(),
        valo: Number.isFinite(valo) ? valo : null, commentaire: String(cellules[colonnes.fci] ?? '').trim(),
        onglet, ligne: numero
      });
    }
  }
  return lies;
}

export function lireLies() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}
export function noterLies(lies) {
  try { localStorage.setItem(CLE, JSON.stringify(lies || {})); } catch { /* facultatif */ }
}

export function liesDe(d, lies) {
  return [...(lies[prefixe(d.gcblo)] || [])].sort((a, b) => (b.valo ?? -1) - (a.valo ?? -1));
}
export function totalLies(d, lies) {
  const l = lies[prefixe(d.gcblo)];
  if (!l?.length) return null;
  return Math.round(l.reduce((s, x) => s + (x.valo || 0), 0) * 100) / 100;
}

/** Seuils de couleur, relatifs au registre : « fort » = top 10 % des valos liées, « moyen » = top 30 %. */
export function chaleurs(dossiers, lies) {
  const totaux = dossiers.map(d => totalLies(d, lies)).filter(v => v > 0).sort((a, b) => b - a);
  if (!totaux.length) return { moyen: Infinity, fort: Infinity };
  const rang = part => totaux[Math.max(0, Math.ceil(totaux.length * part) - 1)];
  return { fort: rang(0.1), moyen: rang(0.3) };
}
export const chaleur = (total, seuils) => !total ? '' : total >= seuils.fort ? 'lie-fort' : total >= seuils.moyen ? 'lie-moyen' : 'lie-faible';
