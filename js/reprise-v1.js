/**
 * reprise-v1.js — relit les dossiers enregistrés par l'ancienne version.
 *
 * La v1 et la v2 sont servies à la même adresse : la v2 peut donc lire ce que
 * la v1 a laissé dans le navigateur (clé « gcblo.affectations.v1 »). La même
 * conversion sert aussi à restaurer une sauvegarde JSON faite avec la v1.
 *
 * Correspondance des champs :
 *   categorie → type      statut → statutDft      history → historique
 *   createdAt → creeLe    updatedAt → modifieLe   (fci, dates, commentaire : identiques)
 */
import { FORMATS, typeParCode, statutParCode, STATUT_PAR_DEFAUT } from './config.js';
import { estJour } from './dates.js';

export const CLE_V1 = 'gcblo.affectations.v1';

/** Anciens statuts de la toute première v1 → statuts DFT. */
const ANCIENS_STATUTS = { A_TRAITER: 'A_FAIRE', EN_COURS: 'EN_VALIDATION', RELANCE: 'EN_VALIDATION', TERMINE: 'MAD', BLOQUE: 'REFUSE' };
const ACTIONS = { creation: 'creation', import: 'creation', relance: 'relance' };

/** Vrai si les données ressemblent à une sauvegarde v1 (champ « categorie »). */
export const estFormatV1 = donnees => Array.isArray(donnees?.dossiers) && donnees.dossiers.some(d => 'categorie' in d);

/**
 * Convertit des données v1 en dossiers v2.
 * Renvoie { dossiers, ignores } : les dossiers illisibles ou en double sont ignorés.
 */
export function convertirV1(donnees, { maintenant = new Date() } = {}) {
  const vus = new Set();
  const dossiers = [];
  let ignores = 0;
  for (const d of donnees?.dossiers || []) {
    const gcblo = String(d.gcblo || '').trim().toUpperCase();
    const type = typeParCode(d.categorie)?.code;
    if (!FORMATS.gcblo.test(gcblo) || !type || vus.has(gcblo)) { ignores++; continue; }
    vus.add(gcblo);
    const statut = statutParCode(d.statut)?.code || ANCIENS_STATUTS[d.statut] || STATUT_PAR_DEFAUT;
    const creeLe = d.createdAt || maintenant.toISOString();
    dossiers.push({
      id: d.id || `v1-${gcblo}`,
      type,
      gcblo,
      fci: (Array.isArray(d.fci) ? d.fci : []).map(String).filter(f => FORMATS.fci.test(f)),
      dateAffectation: estJour(d.dateAffectation) ? d.dateAffectation : creeLe.slice(0, 10),
      dateRelance: estJour(d.dateRelance) ? d.dateRelance : null,
      statutDft: statut,
      commentaire: String(d.commentaire || ''),
      creeLe,
      modifieLe: d.updatedAt || creeLe,
      historique: [
        ...(Array.isArray(d.history) ? d.history : []).map(h => ({ date: h.at, action: ACTIONS[h.type] || 'modification', detail: String(h.text || '') })),
        { date: maintenant.toISOString(), action: 'reprise', detail: 'Repris de la version 1' }
      ]
    });
  }
  return { dossiers, ignores };
}

/** Lit les données v1 laissées dans ce navigateur, ou null s'il n'y en a pas. */
export function lireV1Navigateur() {
  try {
    const donnees = JSON.parse(localStorage.getItem(CLE_V1));
    return donnees?.dossiers?.length ? donnees : null;
  } catch { return null; }
}
