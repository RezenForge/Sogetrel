/**
 * line.js — le lien vers le dossier LINE (flashback.orange.fr) d'un GCBLO.
 *
 *   SBA401687-THF010 → https://flashback.orange.fr/line/dossier/travaux/consult/401687/SBA/Limousin%20Poitou%20Charentes/THF01-0/info-gene
 *
 *   - les 6 chiffres, puis les 3 lettres ;
 *   - la région selon les 3 lettres (REGIONS_LINE) ;
 *   - la fin du GCBLO avec un tiret avant le dernier chiffre (THF010 → THF01-0).
 *
 *   lienLine(gcblo) → { ok: true, url } | { ok: false, erreur }
 */
export const REGIONS_LINE = Object.freeze({
  'Limousin Poitou Charentes': ['SBA', 'LRO', 'POI', 'ANG', 'NIO'],
  'Aquitaine': ['MED', 'BOR', 'EST', 'LIB', 'ARC']
});

export function lienLine(gcblo) {
  const m = String(gcblo ?? '').toUpperCase().match(/^([A-Z]{3})(\d{6})-([A-Z]+\d*)(\d)$/);
  if (!m) return { ok: false, erreur: `${gcblo} : GCBLO non reconnu pour LINE` };
  const [, lettres, chiffres, debutFin, dernier] = m;
  const region = Object.keys(REGIONS_LINE).find(r => REGIONS_LINE[r].includes(lettres));
  if (!region) return { ok: false, erreur: `${lettres} : région LINE inconnue (connues : ${Object.values(REGIONS_LINE).flat().join(', ')})` };
  return { ok: true, url: `https://flashback.orange.fr/line/dossier/travaux/consult/${chiffres}/${lettres}/${encodeURIComponent(region)}/${debutFin}-${dernier}/info-gene` };
}
