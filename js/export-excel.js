/**
 * export-excel.js — R14 : le fichier « registre-gcblo.csv » pour le classeur partagé.
 *
 * Écrit à chaque sauvegarde (manuelle ou automatique), dans le même dossier, toujours
 * sous le même nom. La macro « MajDepuisRegistre » du classeur IMMO-COORDI-DISSIM.xlsm
 * le lit et met à jour les colonnes J (FCI) et E (« VALIDÉ GDP » pour les dossiers Attach).
 *
 * Format pensé pour Excel en français : séparateur « ; », UTF-8 avec BOM, une ligne par dossier.
 * La macro repère les colonnes par leur nom d'en-tête : l'ordre peut évoluer sans la casser.
 *
 *   csvRegistre(dossiers, maintenant) → texte
 */
import { typeParCode, statutParCode } from './config.js';
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
