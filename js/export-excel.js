/**
 * export-excel.js — R14 : le fichier « registre-gcblo.csv » pour le classeur partagé.
 *
 * Écrit à chaque sauvegarde (manuelle ou automatique), dans le même dossier, toujours
 * sous le même nom. La macro « MajDepuisRegistre » du classeur IMMO-COORDI-DISSIM.xlsm
 * le lit et met à jour les colonnes J (FCI) et E (« FACTU » pour les dossiers Attach).
 *
 * Format pensé pour Excel en français : séparateur « ; », UTF-8 avec BOM, une ligne par dossier.
 * La macro repère les colonnes par leur nom d'en-tête : l'ordre peut évoluer sans la casser.
 *
 *   csvRegistre(dossiers, maintenant) → texte
 */
import { typeParCode, statutParCode, IMPORT_EXCEL } from './config.js';
import { formater } from './dates.js';

export const NOM_CSV = 'registre-gcblo.csv';
const ENTETES = ['GCBLO', 'AFFECT', 'STATUT DFT', 'CODE STATUT', 'FCI', 'COMMUNE', 'VALO', 'DATE', 'MODIFIE LE'];

/** Une valeur sans « ; » ni retour à la ligne (le CSV reste simple à relire en VBA). */
const propre = v => String(v ?? '').replace(/\s*[;\r\n]+\s*/g, ' ').trim();

export function csvRegistre(dossiers, maintenant = new Date()) {
  const lignes = [...dossiers].sort((a, b) => a.gcblo.localeCompare(b.gcblo)).map(d => [
    d.gcblo,
    typeParCode(d.type)?.libelle || '',
    statutParCode(d.statutDft)?.libelle || '',
    d.statutDft,
    d.fci.join(' '),
    d.commune || '',
    d.valorisation === null || d.valorisation === undefined ? '' : String(d.valorisation).replace('.', ','),
    d.dateAffectation ? formater(d.dateAffectation) : '',
    d.modifieLe ? new Date(d.modifieLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''
  ].map(propre).join(';'));
  return '﻿' + [ENTETES.join(';'), ...lignes].join('\r\n') + '\r\n';
}

/*
 * R14, dans l'autre sens : « classeur-gcblo.csv », écrit par la macro du classeur partagé
 * dans le même dossier. Une ligne par ligne « GCBLO » des onglets 33, 16, 17, 79, 86, lue
 * dans le classeur ouvert (même ce qui n'est pas encore enregistré).
 *
 *   ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J
 *
 * lireCsvClasseur(texte) → un « classeur » au format de lireClasseur (xlsx.js), pour que
 * extraireDossiers (R10) le traite exactement comme un import Excel.
 */
export const NOM_CSV_CLASSEUR = 'classeur-gcblo.csv';
const CHAMPS_CLASSEUR = { DOSSIER: 'dossier', 'COLONNE E': 'filtre', AFFECT: 'type', COMMUNE: 'commune', VALO: 'valorisation', 'COLONNE J': 'fci' };

export function lireCsvClasseur(texte, reglages = IMPORT_EXCEL) {
  const lignes = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) throw new Error(`${NOM_CSV_CLASSEUR} est vide`);
  const entetes = lignes[0].split(';').map(e => e.trim().toUpperCase());
  const iOnglet = entetes.indexOf('ONGLET'), iLigne = entetes.indexOf('LIGNE');
  if (iOnglet < 0 || entetes.indexOf('DOSSIER') < 0 || entetes.indexOf('COLONNE E') < 0) throw new Error(`${NOM_CSV_CLASSEUR} : en-têtes ONGLET, DOSSIER, COLONNE E attendus`);
  const feuilles = {};
  lignes.slice(1).forEach((l, n) => {
    const v = l.split(';');
    const onglet = (v[iOnglet] ?? '').trim();
    const cellules = {};
    entetes.forEach((e, i) => { const champ = CHAMPS_CLASSEUR[e]; if (champ) cellules[reglages.colonnes[champ]] = (v[i] ?? '').trim(); });
    (feuilles[onglet] ||= []).push({ numero: Number(v[iLigne]) || n + 2, cellules });
  });
  return { feuilles };
}
