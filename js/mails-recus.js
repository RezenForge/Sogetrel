/**
 * mails-recus.js — R18 : les FCI reçus par mail (réponses des partenaires à l'affectation).
 *
 * La macro Outlook LireFciMails écrit mails-gcblo.csv dans le dossier des sauvegardes : une ligne par mail
 * reçu dont l'objet porte « GCBLO | ‹GCBLO› » et dont le texte (hors partie citée) contient un FCI.
 * Le registre le lit chaque minute et à chaque sauvegarde.
 *
 * Fonctions pures :
 *   lireCsvMailsRecus(texte)          → [{ gcblo, fci: [..], recuLe, de, objet }]
 *   trierMailsRecus(dossiers, lignes) → { appliquer: [{ dossier, fci, ligne }], differents: [{ dossier, fci, ligne }], inconnus: [ligne] }
 *     - dossier sans FCI : le(s) FCI du mail sont à appliquer ;
 *     - dossier qui a déjà ces FCI : rien (déjà fait, ou le même mail relu) ;
 *     - dossier qui a un AUTRE FCI : signalé, rien de changé (à vérifier à la main) ;
 *     - GCBLO absent du registre : signalé.
 */
import { FORMATS } from './config.js';

export const NOM_CSV_MAILS_RECUS = 'mails-gcblo.csv';

export function lireCsvMailsRecus(texte) {
  const lignes = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) return [];
  const entetes = lignes[0].split(';').map(e => e.trim().toUpperCase());
  const col = nom => entetes.indexOf(nom);
  const [iG, iF, iR, iD, iO] = ['GCBLO', 'FCI', 'RECU LE', 'DE', 'OBJET'].map(col);
  if (iG < 0 || iF < 0) return [];
  return lignes.slice(1).map(l => {
    const c = l.split(';');
    const fci = [...new Set((c[iF] || '').toUpperCase().split(/\s+/).filter(f => FORMATS.fci.test(f)))];
    return { gcblo: (c[iG] || '').trim().toUpperCase(), fci, recuLe: iR >= 0 ? (c[iR] || '').trim() : '', de: iD >= 0 ? (c[iD] || '').trim() : '', objet: iO >= 0 ? (c[iO] || '').trim() : '' };
  }).filter(x => x.gcblo && x.fci.length);
}

export function trierMailsRecus(dossiers, lignes) {
  const appliquer = [], differents = [], inconnus = [];
  const vus = new Set();
  for (const ligne of lignes) {
    const dossier = dossiers.find(d => d.gcblo === ligne.gcblo);
    if (!dossier) { if (!vus.has(ligne.gcblo)) inconnus.push(ligne); vus.add(ligne.gcblo); continue; }
    const deja = new Set(dossier.fci || []);
    const nouveaux = ligne.fci.filter(f => !deja.has(f));
    if (!nouveaux.length) continue;
    // Un même dossier dans plusieurs mails : un seul ajout (le premier lu)
    if (appliquer.some(a => a.dossier.id === dossier.id) || differents.some(a => a.dossier.id === dossier.id)) continue;
    if (deja.size) differents.push({ dossier, fci: nouveaux, ligne });
    else appliquer.push({ dossier, fci: nouveaux, ligne });
  }
  return { appliquer, differents, inconnus };
}
