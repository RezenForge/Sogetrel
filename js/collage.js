/**
 * collage.js — lit une liste collée (copiée d'Excel ou d'un mail). Ne modifie rien.
 *
 * Ce qui est reconnu :
 *  - un GCBLO par ligne, avec ou sans ses FCI à côté (« SBA501404-THF010  F26154200726 ») ;
 *  - plusieurs GCBLO sur une même ligne : chaque FCI suit le GCBLO qui le précède ;
 *  - le classeur « robot » : avec sa ligne d'en-tête (« GCBLO NUM21 | FCI | | GCBLO AIR | FCI »),
 *    chaque colonne GCBLO donne son type aux dossiers qu'elle contient ;
 *  - sans en-tête, un type écrit sur la ligne (« AIR », « NUM21 », « Sogetrel ») ;
 *  - « ? », « aucun », « Pas de GCBLO » dans une colonne FCI : pas de FCI.
 *
 * lireCollage(texte, dossiersExistants) →
 *   { lus, nouveaux: [{ gcblo, fci, type|null }], existants, doublons, conflits, illisibles }
 *   conflits : même GCBLO avec deux types différents dans la liste ({ gcblo, garde, autre }) — à vérifier
 */
import { typeParCode } from './config.js';

const RE_JETON = /([A-Z]{3}\d{6})\s*-?\s*([A-Z]{3}\d{3})|(F\d{11})/gi;
const RE_GCBLO = /[A-Z]{3}\d{6}\s*-?\s*[A-Z]{3}\d{3}/gi;
const MOTS_TYPE = [['SOGETREL', /\bsogetrel\b/i], ['NUM21', /\bnum(?:erus)?\s?21\b/i], ['AIR', /\bair\b/i]];

/** Le type écrit dans un texte, ou null. */
function typeDans(texte) {
  return MOTS_TYPE.find(([, re]) => re.test(texte))?.[0] || null;
}

/** Vrai si le texte collé est une liste à traiter comme un lot (et non un simple mot). */
export function ressembleAUneListe(texte) {
  const n = (String(texte).match(RE_GCBLO) || []).length;
  return n >= 2 || (n >= 1 && /\n/.test(String(texte).trim()));
}

export function lireCollage(texte, dossiersExistants = []) {
  const entrees = [], illisibles = [];
  let typesColonnes = [];                         // type de chaque colonne, d'après la ligne d'en-tête
  let colonnesSaisie = [];                        // colonnes « AFFECTATION GCBLO … » : cases de saisie du robot

  for (const ligne of String(texte).split(/\r?\n/)) {
    if (!ligne.trim()) continue;
    const cellules = ligne.split('\t');
    const contientGcblo = RE_GCBLO.test(ligne); RE_GCBLO.lastIndex = 0;

    // Ligne d'en-tête : elle mentionne « GCBLO » mais ne contient aucun GCBLO
    if (!contientGcblo && /gcblo/i.test(ligne)) {
      typesColonnes = cellules.map(c => (/gcblo/i.test(c) ? typeDans(c) : null));
      colonnesSaisie = cellules.map(c => /affectation/i.test(c));
      continue;
    }
    if (!contientGcblo) { illisibles.push(ligne.trim()); continue; }

    const typeLigne = typeDans(ligne);
    let courant = null;
    cellules.forEach((cellule, i) => {
      for (const m of cellule.matchAll(RE_JETON)) {
        if (m[1]) {
          courant = { gcblo: `${m[1]}-${m[2]}`.toUpperCase(), fci: [], type: typesColonnes[i] || typeLigne, saisie: !!colonnesSaisie[i] };
          entrees.push(courant);
        } else if (courant && !courant.fci.includes(m[3].toUpperCase())) {
          courant.fci.push(m[3].toUpperCase());
        }
      }
    });
  }

  // Les listes passent avant les cases de saisie du robot (qui répètent en général un dossier déjà listé)
  const ordonnees = [...entrees.filter(e => !e.saisie), ...entrees.filter(e => e.saisie)];

  // Classement : nouveaux, déjà présents dans le registre, en double dans la liste elle-même
  const existants = [], doublons = [], conflits = [], nouveaux = [], vus = new Map();
  for (const { saisie, ...e } of ordonnees) {
    if (vus.has(e.gcblo)) {
      // Même GCBLO plus loin dans la liste : on complète ses FCI, et on le signale
      const premier = vus.get(e.gcblo);
      e.fci.forEach(f => { if (!premier.fci.includes(f)) premier.fci.push(f); });
      doublons.push(e.gcblo);
      if (!saisie && e.type && premier.type && e.type !== premier.type) conflits.push({ gcblo: e.gcblo, garde: premier.type, autre: e.type });
      continue;
    }
    vus.set(e.gcblo, e);
    const existant = dossiersExistants.find(d => d.gcblo === e.gcblo);
    if (existant) existants.push({ gcblo: e.gcblo, type: typeParCode(existant.type)?.libelle });
    else nouveaux.push(e);
  }
  return { lus: entrees.length, nouveaux, existants, doublons, conflits, illisibles };
}
