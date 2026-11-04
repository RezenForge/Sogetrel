/**
 * info.js — retrouver des dossiers à partir d'une liste collée (colonne Excel, mail…).
 *
 * Fonction pure : elle ne modifie rien. Chaque mot de la liste est cherché :
 *   - un GCBLO complet (même avec espaces, minuscules ou sans tiret) → correspondance exacte ;
 *   - un morceau d'au moins 4 chiffres (ex. 501404) → retenu s'il désigne un seul dossier ;
 *   - le reste (en-tête « GCBLO », texte) est ignoré.
 *
 *   chercherListe(texte, dossiers) → { trouves: [dossiers, dans l'ordre collé, sans doublon],
 *                                      introuvables: ['…'], ambigus: ['…'], ignores: n }
 */
import { FORMATS } from './config.js';

const sansTiret = g => g.replace('-', '');
/** « sba501404thf010 » → « SBA501404-THF010 » si c'est un GCBLO, sinon null. */
function lireGcblo(mot) {
  const brut = mot.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = brut.match(/^([A-Z]{3}\d{6})([A-Z]{3}\d{3})$/);
  const g = m ? `${m[1]}-${m[2]}` : null;
  return g && FORMATS.gcblo.test(g) ? g : null;
}

export function chercherListe(texte, dossiers) {
  const parCle = new Map(dossiers.map(d => [sansTiret(d.gcblo), d]));
  const trouves = [], introuvables = [], ambigus = [], vus = new Set();
  let ignores = 0;
  // Les GCBLO collés peuvent contenir une espace (« SBA501404 - THF010 ») : on recolle d'abord ces morceaux
  const mots = String(texte ?? '').replace(/([A-Za-z]{3}\d{6})\s*-\s*([A-Za-z]{3}\d{3})/g, '$1-$2').split(/[\s,;|]+/).filter(Boolean);
  for (const mot of mots) {
    const g = lireGcblo(mot);
    if (g) {
      if (vus.has(g)) continue;
      vus.add(g);
      const d = parCle.get(sansTiret(g));
      if (d) trouves.push(d); else introuvables.push(g);
      continue;
    }
    const chiffres = mot.replace(/\D/g, '');
    if (chiffres.length >= 4 && chiffres === mot.replace(/[\s-]/g, '')) {
      if (vus.has(chiffres)) continue;
      vus.add(chiffres);
      const possibles = dossiers.filter(d => sansTiret(d.gcblo).includes(chiffres));
      if (possibles.length === 1) { if (!trouves.includes(possibles[0])) trouves.push(possibles[0]); }
      else if (possibles.length > 1) ambigus.push(mot);
      else introuvables.push(mot);
      continue;
    }
    ignores++;
  }
  return { trouves, introuvables, ambigus, ignores };
}
