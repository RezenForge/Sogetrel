/**
 * morpion.js — un petit morpion en ASCII (commande `morpion`), contre une IA imbattable (minimax).
 * Tu joues X et tu commences ; l'IA joue O. Clic sur une case, ou touche 1 à 9 (ligne de saisie vide).
 * La partie disparaît une fois gagnée, perdue ou nulle, ou dès qu'une commande est lancée.
 *
 *   gagnant(plateau) → 'X' | 'O' | 'nul' | null      plateau : tableau de 9 cases ('X', 'O' ou null)
 *   coupIA(plateau, ia = 'O') → indice 0-8 (le meilleur coup)
 *   demarrerMorpion(el, { finir }) : joue dans l'élément, finir() quand la partie se termine
 */
const LIGNES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function gagnant(p) {
  for (const [a, b, c] of LIGNES) if (p[a] && p[a] === p[b] && p[a] === p[c]) return p[a];
  return p.every(Boolean) ? 'nul' : null;
}

/** Minimax : +10 si l'IA gagne (plus tôt = mieux), -10 si elle perd, 0 si nul. */
function score(p, ia, tour, profondeur) {
  const g = gagnant(p);
  if (g === ia) return 10 - profondeur;
  if (g === 'nul') return 0;
  if (g) return profondeur - 10;
  const autre = tour === 'X' ? 'O' : 'X';
  let meilleur = tour === ia ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (p[i]) continue;
    p[i] = tour;
    const s = score(p, ia, autre, profondeur + 1);
    p[i] = null;
    meilleur = tour === ia ? Math.max(meilleur, s) : Math.min(meilleur, s);
  }
  return meilleur;
}

export function coupIA(plateau, ia = 'O') {
  const p = [...plateau], adversaire = ia === 'O' ? 'X' : 'O';
  let meilleur = -Infinity, coup = -1;
  for (let i = 0; i < 9; i++) {
    if (p[i]) continue;
    p[i] = ia;
    const s = score(p, ia, adversaire, 1);
    p[i] = null;
    if (s > meilleur) { meilleur = s; coup = i; }
  }
  return coup;
}

export function demarrerMorpion(el, { finir = () => {} } = {}) {
  const p = Array(9).fill(null);
  let fini = false, message = 'à toi · clic sur une case ou touche 1-9';
  const champ = document.querySelector('#saisie');

  const case_ = i => p[i]
    ? `<span class="mp-${p[i]}">${p[i]}</span>`
    : `<button type="button" class="mp-case" data-case="${i}" aria-label="case ${i + 1}">${i + 1}</button>`;
  const ligne = r => ` ${case_(r * 3)} │ ${case_(r * 3 + 1)} │ ${case_(r * 3 + 2)} `;
  function dessiner() {
    el.innerHTML = `<pre class="mp-plateau">${ligne(0)}\n───┼───┼───\n${ligne(1)}\n───┼───┼───\n${ligne(2)}</pre><div class="mp-message">${message}</div>`;
  }
  function terminer(g) {
    fini = true;
    message = g === 'X' ? '<span class="mp-gagne">gagné !</span> (vraiment ?)' : g === 'O' ? '<span class="mp-perdu">perdu</span> · l\'IA ne pardonne pas' : 'match nul · c\'est le mieux qu\'on puisse faire';
    dessiner();
    arreter();
    setTimeout(finir, 2200);
  }
  function jouer(i) {
    if (fini || p[i]) return;
    p[i] = 'X';
    let g = gagnant(p);
    if (g) return terminer(g);
    p[coupIA(p, 'O')] = 'O';
    g = gagnant(p);
    if (g) return terminer(g);
    dessiner();
  }
  const clic = e => { const b = e.target.closest('[data-case]'); if (b) { e.stopPropagation(); jouer(Number(b.dataset.case)); champ?.focus(); } };
  // Touches 1 à 9 quand la ligne de saisie est vide (sinon c'est une commande qu'on tape)
  const touche = e => {
    if (fini || !/^[1-9]$/.test(e.key) || e.ctrlKey || e.altKey || e.metaKey || (champ && champ.value)) return;
    e.preventDefault();
    jouer(Number(e.key) - 1);
  };
  function arreter() { el.removeEventListener('click', clic); document.removeEventListener('keydown', touche, true); }
  el.addEventListener('click', clic);
  document.addEventListener('keydown', touche, true);
  dessiner();
  return arreter;
}
