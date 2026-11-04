/**
 * info.js — retrouver des dossiers à partir d'une liste collée (colonne Excel, mail…).
 *
 * Fonction pure : elle ne modifie rien. Chaque mot de la liste est cherché :
 *   - un GCBLO complet (même avec espaces, minuscules, sans tiret, ou collé à un autre) → correspondance exacte ;
 *   - un début de GCBLO (« SBA501023 », sans la fin -THF010…) → tous les dossiers qui commencent ainsi ;
 *   - un morceau d'au moins 4 chiffres (ex. 501404) → retenu s'il désigne un seul dossier ;
 *   - le reste (en-tête « GCBLO », texte) est ignoré.
 *
 *   chercherListe(texte, dossiers) → { trouves: [dossiers, dans l'ordre collé, sans doublon],
 *                                      introuvables: ['…'], ambigus: ['…'], ignores: n }
 */
const cle = g => g.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Un GCBLO n'importe où dans le texte, même collé à un autre, avec ou sans tiret (tiret, tiret long…), espaces tolérés. */
const MOTIF_GCBLO = /([A-Za-z]{3})\s*[-‐‑‒–—]?\s*(\d{6})\s*[-‐‑‒–—]?\s*([A-Za-z]{3})\s*(\d{3})(?!\d)/g;

export function chercherListe(texte, dossiers) {
  const parCle = new Map(dossiers.map(d => [cle(d.gcblo), d]));
  const places = [], introuvables = [], ambigus = [], vus = new Set();   // places : [position dans le texte, dossier]
  let ignores = 0;
  // Ce qui est reconnu est remplacé par autant d'espaces : les positions restent celles du texte collé
  const blanc = m => ' '.repeat(m.length);

  // 1. Les GCBLO complets, cherchés dans tout le texte (une colonne collée bout à bout reste lisible)
  const reste = String(texte ?? '').replace(MOTIF_GCBLO, (m, a, b, c, n, pos) => {
    const g = `${a}${b}-${c}${n}`.toUpperCase();
    if (!vus.has(g)) {
      vus.add(g);
      const d = parCle.get(cle(g));
      if (d) places.push([pos, d]); else introuvables.push(g);
    }
    return blanc(m);
  });

  // 2. Un début de GCBLO seul (« SBA501023 ») : les dossiers qui commencent ainsi (…-THF010, -THF011, -ACF010, -ACF011)
  const reste2 = reste.replace(/([A-Za-z]{3})\s*[-‐‑‒–—]?\s*(\d{6})(?!\d)/g, (m, a, b, pos) => {
    const debut = `${a}${b}`.toUpperCase();
    if (!vus.has(debut)) {
      vus.add(debut);
      const possibles = dossiers.filter(d => cle(d.gcblo).startsWith(debut));
      if (possibles.length) possibles.forEach(d => places.push([pos, d])); else introuvables.push(debut);
    }
    return blanc(m);
  });

  // 3. Le reste : un morceau d'au moins 4 chiffres désigne un dossier s'il est seul à le contenir
  for (const { 0: mot, index: pos } of reste2.matchAll(/[^\s,;|]+/g)) {
    const chiffres = mot.replace(/\D/g, '');
    if (chiffres.length >= 4 && chiffres === mot.replace(/[\s-]/g, '')) {
      if (vus.has(chiffres)) continue;
      vus.add(chiffres);
      const possibles = dossiers.filter(d => cle(d.gcblo).includes(chiffres));
      if (possibles.length === 1) places.push([pos, possibles[0]]);
      else if (possibles.length > 1) ambigus.push(mot);
      else introuvables.push(mot);
    } else ignores++;
  }
  // Dans l'ordre collé, sans doublon
  const trouves = [];
  for (const [, d] of places.sort((x, y) => x[0] - y[0])) if (!trouves.includes(d)) trouves.push(d);
  return { trouves, introuvables, ambigus, ignores };
}
