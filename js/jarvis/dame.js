/**
 * dame.js — un jeu de dames (commande cachée `dame`) sur damier 10 × 10, règles internationales
 * simplifiées : prise obligatoire et majoritaire, les pions prennent aussi en arrière, dames volantes,
 * promotion en fin de coup. Tu as les blancs (en bas) et tu commences ; l'IA a les noirs.
 * L'IA cherche quelques coups à l'avance (alpha-bêta), avec une part de hasard pour rester battable.
 *
 *   positionDepart() → plateau (100 cases : null, 'b', 'B', 'n', 'N' ; majuscule = dame)
 *   coupsLegaux(plateau, camp) → [{ de, vers, chemin: [cases], prises: [cases] }]   camp : 'b' ou 'n'
 *   jouerCoup(plateau, coup) → nouveau plateau
 *   coupIA(plateau, camp, { profondeur, hasard }) → coup
 *   demarrerDame(el, { finir }) : joue dans l'élément, finir() en fin de partie
 */
const N = 10;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const rc = i => [Math.floor(i / N), i % N];
const idx = (r, c) => r * N + c;
const dans = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const camp = p => p && p.toLowerCase();
const estDame = p => p && p === p.toUpperCase();

export function positionDepart() {
  const p = Array(N * N).fill(null);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 4) p[idx(r, c)] = 'n';
    else if (r > 5) p[idx(r, c)] = 'b';
  }
  return p;
}

/** Les rafles possibles depuis `de` (recherche en profondeur ; les pièces prises restent jusqu'à la fin du coup). */
function rafles(p, de, piece) {
  const res = [];
  const moi = camp(piece), dame = estDame(piece);
  const explorer = (pos, chemin, prises) => {
    let prolonge = false;
    const [r, c] = rc(pos);
    for (const [dr, dc] of DIRS) {
      if (dame) {
        // Dame volante : glisse sur les cases vides, saute une pièce adverse, se pose sur n'importe quelle case vide après
        let rr = r + dr, cc = c + dc;
        while (dans(rr, cc) && !p[idx(rr, cc)] || (dans(rr, cc) && idx(rr, cc) === de)) { rr += dr; cc += dc; }
        if (!dans(rr, cc)) continue;
        const cible = idx(rr, cc);
        if (camp(p[cible]) === moi || prises.includes(cible)) continue;
        rr += dr; cc += dc;
        while (dans(rr, cc) && (!p[idx(rr, cc)] || idx(rr, cc) === de)) {
          prolonge = true;
          explorer(idx(rr, cc), [...chemin, idx(rr, cc)], [...prises, cible]);
          rr += dr; cc += dc;
        }
      } else {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (!dans(r2, c2)) continue;
        const cible = idx(r1, c1), arrivee = idx(r2, c2);
        if (!p[cible] || camp(p[cible]) === moi || prises.includes(cible)) continue;
        if (p[arrivee] && arrivee !== de) continue;
        prolonge = true;
        explorer(arrivee, [...chemin, arrivee], [...prises, cible]);
      }
    }
    if (!prolonge && prises.length) res.push({ de, vers: pos, chemin, prises });
  };
  explorer(de, [de], []);
  return res;
}

export function coupsLegaux(p, moi) {
  let prises = [];
  const simples = [];
  for (let i = 0; i < N * N; i++) {
    const piece = p[i];
    if (camp(piece) !== moi) continue;
    prises.push(...rafles(p, i, piece));
    const [r, c] = rc(i);
    if (estDame(piece)) {
      for (const [dr, dc] of DIRS) {
        let rr = r + dr, cc = c + dc;
        while (dans(rr, cc) && !p[idx(rr, cc)]) { simples.push({ de: i, vers: idx(rr, cc), chemin: [i, idx(rr, cc)], prises: [] }); rr += dr; cc += dc; }
      }
    } else {
      const avant = moi === 'b' ? -1 : 1;
      for (const dc of [-1, 1]) {
        const rr = r + avant, cc = c + dc;
        if (dans(rr, cc) && !p[idx(rr, cc)]) simples.push({ de: i, vers: idx(rr, cc), chemin: [i, idx(rr, cc)], prises: [] });
      }
    }
  }
  if (prises.length) {
    // Prise majoritaire : seules les rafles qui prennent le plus de pièces sont permises
    const max = Math.max(...prises.map(m => m.prises.length));
    return prises.filter(m => m.prises.length === max);
  }
  return simples;
}

export function jouerCoup(p, m) {
  const q = [...p];
  let piece = q[m.de];
  q[m.de] = null;
  for (const x of m.prises) q[x] = null;
  const [r] = rc(m.vers);
  if (piece === 'b' && r === 0) piece = 'B';
  if (piece === 'n' && r === N - 1) piece = 'N';
  q[m.vers] = piece;
  return q;
}

/** Évaluation du point de vue des noirs : pions 1, dames 3, petit bonus d'avancée. */
function evaluer(p) {
  let s = 0;
  for (let i = 0; i < N * N; i++) {
    const x = p[i];
    if (!x) continue;
    const [r] = rc(i);
    if (x === 'n') s += 1 + r * 0.03;
    else if (x === 'N') s += 3;
    else if (x === 'b') s -= 1 + (N - 1 - r) * 0.03;
    else if (x === 'B') s -= 3;
  }
  return s;
}

function alphabeta(p, tour, profondeur, a, b) {
  const coups = coupsLegaux(p, tour);
  if (!coups.length) return tour === 'n' ? -1000 - profondeur : 1000 + profondeur;
  if (profondeur === 0) return evaluer(p);
  if (tour === 'n') {
    let v = -Infinity;
    for (const m of coups) { v = Math.max(v, alphabeta(jouerCoup(p, m), 'b', profondeur - 1, a, b)); a = Math.max(a, v); if (a >= b) break; }
    return v;
  }
  let v = Infinity;
  for (const m of coups) { v = Math.min(v, alphabeta(jouerCoup(p, m), 'n', profondeur - 1, a, b)); b = Math.min(b, v); if (a >= b) break; }
  return v;
}

/** Probabilité que l'IA joue un coup au hasard (parmi les coups légaux) plutôt que le meilleur. */
export const ERREUR_IA = 0.2;

export function coupIA(p, moi = 'n', { profondeur = 4, hasard = Math.random } = {}) {
  const coups = coupsLegaux(p, moi);
  if (!coups.length) return null;
  if (coups.length === 1) return coups[0];
  if (hasard() < ERREUR_IA) return coups[Math.floor(hasard() * coups.length)];
  const adverse = moi === 'n' ? 'b' : 'n', signe = moi === 'n' ? 1 : -1;
  let meilleur = null, score = -Infinity;
  for (const m of coups) {
    const s = signe * alphabeta(jouerCoup(p, m), adverse, profondeur - 1, -Infinity, Infinity) + hasard() * 0.01;
    if (s > score) { score = s; meilleur = m; }
  }
  return meilleur;
}

export function demarrerDame(el, { finir = () => {} } = {}) {
  let p = positionDepart(), choisie = null, fini = false, dernier = null, sansPrise = 0;
  let message = 'à toi · clic sur un pion blanc, puis sur sa case d\'arrivée';

  const symbole = x => x === 'b' ? '<span class="dm-b">●</span>' : x === 'B' ? '<span class="dm-b">♛</span>'
    : x === 'n' ? '<span class="dm-n">●</span>' : x === 'N' ? '<span class="dm-n">♛</span>' : '';
  function dessiner() {
    const coups = fini ? [] : coupsLegaux(p, 'b');
    const jouables = new Set(coups.map(m => m.de));
    const arrivees = new Set(choisie !== null ? coups.filter(m => m.de === choisie).map(m => m.vers) : []);
    const marques = new Set(dernier ? [...dernier.chemin] : []);
    let html = '';
    for (let i = 0; i < N * N; i++) {
      const [r, c] = rc(i);
      const fonce = (r + c) % 2 === 1;
      const cls = ['dm-c', fonce ? 'fonce' : 'clair', i === choisie ? 'choisie' : '', arrivees.has(i) ? 'arrivee' : '', jouables.has(i) && choisie === null ? 'jouable' : '', marques.has(i) ? 'dernier' : ''].filter(Boolean).join(' ');
      html += fonce ? `<button type="button" class="${cls}" data-case="${i}">${symbole(p[i])}</button>` : `<span class="${cls}"></span>`;
    }
    const nb = x => p.filter(v => camp(v) === x).length;
    el.innerHTML = `<div class="dm-score"><span class="dm-b">● ${nb('b')}</span><span class="dm-n">● ${nb('n')}</span></div><div class="dm-plateau">${html}</div><div class="mp-message">${message}</div>`;
  }
  function terminer(texte) {
    fini = true; choisie = null; message = texte;
    dessiner();
    setTimeout(finir, 2800);
  }
  function apresCoup(m, qui) {
    sansPrise = m.prises.length || !estDame(p[m.vers]) ? 0 : sansPrise + 1;
    dernier = m;
    if (sansPrise >= 30) return terminer('match nul · 30 coups de dames sans prise'), true;
    const suivant = qui === 'b' ? 'n' : 'b';
    if (!coupsLegaux(p, suivant).length) return terminer(qui === 'b' ? '<span class="mp-gagne">gagné !</span> bien joué' : '<span class="mp-perdu">perdu</span> · retente ta chance'), true;
    return false;
  }
  function tourIA() {
    message = 'l\'IA réfléchit…'; dessiner();
    setTimeout(() => {
      if (fini) return;
      const m = coupIA(p, 'n');
      p = jouerCoup(p, m);
      if (apresCoup(m, 'n')) return;
      const coups = coupsLegaux(p, 'b');
      message = coups[0]?.prises.length ? `à toi · prise obligatoire${coups[0].prises.length > 1 ? ` (${coups[0].prises.length} pièces)` : ''}` : 'à toi';
      dessiner();
    }, 250);
  }
  const clic = e => {
    const b = e.target.closest('[data-case]');
    if (!b || fini) return;
    e.stopPropagation();
    const i = Number(b.dataset.case);
    const coups = coupsLegaux(p, 'b');
    if (choisie !== null) {
      // Plusieurs rafles vers la même case : celle qui prend le plus (déjà garanti), la première sinon
      const m = coups.find(x => x.de === choisie && x.vers === i);
      if (m) {
        p = jouerCoup(p, m); choisie = null;
        if (apresCoup(m, 'b')) return;
        return tourIA();
      }
    }
    choisie = coups.some(x => x.de === i) ? (choisie === i ? null : i) : null;
    if (choisie === null && camp(p[i]) === 'b' && coups.length) message = coups[0].prises.length ? 'prise obligatoire avec un autre pion' : 'ce pion ne peut pas bouger';
    else if (choisie !== null) message = 'clic sur la case d\'arrivée';
    dessiner();
  };
  el.addEventListener('click', clic);
  dessiner();
  return () => el.removeEventListener('click', clic);
}
