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
  const trouves = [], introuvables = [], ambigus = [], vus = new Set();
  let ignores = 0;
  const ajouter = d => { if (!trouves.includes(d)) trouves.push(d); };

  // 1. Les GCBLO complets, cherchés dans tout le texte (une colonne collée bout à bout reste lisible)
  const reste = String(texte ?? '').replace(MOTIF_GCBLO, (_, a, b, c, n) => {
    const g = `${a}${b}-${c}${n}`.toUpperCase();
    if (!vus.has(g)) {
      vus.add(g);
      const d = parCle.get(cle(g));
      if (d) ajouter(d); else introuvables.push(g);
    }
    return ' ';
  });

  // 2. Un début de GCBLO seul (« SBA501023 ») : les dossiers qui commencent ainsi (…-THF010, -THF011, -ACF010, -ACF011)
  const reste2 = reste.replace(/([A-Za-z]{3})\s*[-‐‑‒–—]?\s*(\d{6})(?!\d)/g, (_, a, b) => {
    const debut = `${a}${b}`.toUpperCase();
    if (!vus.has(debut)) {
      vus.add(debut);
      const possibles = dossiers.filter(d => cle(d.gcblo).startsWith(debut));
      if (possibles.length) possibles.forEach(ajouter); else introuvables.push(debut);
    }
    return ' ';
  });

  // 3. Le reste : un morceau d'au moins 4 chiffres désigne un dossier s'il est seul à le contenir
  for (const mot of reste2.split(/[\s,;|]+/).filter(Boolean)) {
    const chiffres = mot.replace(/\D/g, '');
    if (chiffres.length >= 4 && chiffres === mot.replace(/[\s-]/g, '')) {
      if (vus.has(chiffres)) continue;
      vus.add(chiffres);
      const possibles = dossiers.filter(d => cle(d.gcblo).includes(chiffres));
      if (possibles.length === 1) ajouter(possibles[0]);
      else if (possibles.length > 1) ambigus.push(mot);
      else introuvables.push(mot);
    } else ignores++;
  }
  return { trouves, introuvables, ambigus, ignores };
}
