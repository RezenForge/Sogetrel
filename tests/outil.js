/**
 * outil.js — un mini outil de test, sans dépendance.
 *
 *   groupe('Doublons', () => {
 *     test('refuse un GCBLO déjà présent', () => { egal(resultat.ok, false); });
 *   });
 *
 * Les résultats s'affichent dans la page tests/index.html.
 */
const resultats = [];
const enAttente = [];          // tests asynchrones (qui renvoient une promesse)
let groupeCourant = '';

export function groupe(nom, fn) { groupeCourant = nom; fn(); groupeCourant = ''; }

export function test(nom, fn) {
  const entree = { groupe: groupeCourant, nom, ok: true };
  resultats.push(entree);
  const echec = e => { entree.ok = false; entree.message = e?.message || String(e); };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') enAttente.push(r.then(() => {}, echec));
  } catch (e) { echec(e); }
}

/** Égalité profonde (objets, listes) via JSON. */
export function egal(obtenu, attendu, precision = '') {
  const a = JSON.stringify(obtenu), b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${precision ? precision + ' — ' : ''}obtenu ${a}, attendu ${b}`);
}

export function vrai(valeur, precision = 'attendu vrai') {
  if (!valeur) throw new Error(precision);
}

/** Attend les tests asynchrones, affiche les résultats dans l'élément donné et renvoie le bilan. */
export async function afficher(cible) {
  await Promise.all(enAttente);
  const echecs = resultats.filter(r => !r.ok);
  const parGroupe = Map.groupBy ? Map.groupBy(resultats, r => r.groupe) : resultats.reduce((m, r) => m.set(r.groupe, [...(m.get(r.groupe) || []), r]), new Map());
  const echapper = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  cible.innerHTML = `
    <p class="bilan ${echecs.length ? 'ko' : 'ok'}">${echecs.length ? `✗ ${echecs.length} échec(s)` : '✓ tout est vert'} — ${resultats.length} tests</p>
    ${[...parGroupe].map(([g, liste]) => `
      <h2>${echapper(g)}</h2>
      <ul>${liste.map(r => `<li class="${r.ok ? 'ok' : 'ko'}">${r.ok ? '✓' : '✗'} ${echapper(r.nom)}${r.ok ? '' : `<br><code>${echapper(r.message)}</code>`}</li>`).join('')}</ul>`).join('')}`;
  return { total: resultats.length, echecs: echecs.length, details: echecs };
}
