/**
 * dessin.js — tableaux de bord en caractères (style ASCII), pour l'écran du terminal.
 *
 * Ne lit ni ne modifie aucune donnée : on lui donne des chiffres, il rend des lignes.
 * Chaque ligne est une liste de morceaux [texte, classe CSS] ; on en tire
 *   - le texte brut (pour les tests : toutes les lignes ont la même largeur),
 *   - le HTML coloré (pour l'écran).
 *
 * Largeur fixe : LARGEUR caractères, ce qui tient sur un téléphone sans défilement.
 */
import { TYPES, STATUTS } from '../config.js';
import { depuisJour, ajouterJours } from '../dates.js';

export const LARGEUR = 38;
const INTERIEUR = LARGEUR - 4;        // « │ » + contenu + « │ »
const BARRE = 13;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Libellés courts des statuts, pour garder l'alignement. */
const COURT = { A_FAIRE: 'À faire', EN_VALIDATION: 'En valid.', MAD: 'Mis à disp', REFUSE: 'Refusé' };

/** Une barre pleine/vide proportionnelle : au moins un bloc dès qu'il y a quelque chose. */
export function barre(n, total, largeur = BARRE, plein = '█', vide = '░') {
  const k = !total || !n ? 0 : Math.max(1, Math.round(n / total * largeur));
  return [plein.repeat(k), vide.repeat(largeur - k)];
}

/** Mini-histogramme vertical : une colonne par valeur. */
export function etincelle(valeurs) {
  const max = Math.max(...valeurs);
  const crans = '▁▂▃▄▅▆▇█';
  return valeurs.map(v => !v ? '·' : crans[Math.max(0, Math.ceil(v / max * crans.length) - 1)]);
}

const pourcent = (n, total) => (total ? Math.round(n / total * 100) : 0) + ' %';
const longueur = morceaux => morceaux.reduce((l, [t]) => l + [...t].length, 0);

function cadre(titre, droite = '') {
  const debut = `┌─ ${titre} `, fin = droite ? ` ${droite} ─┐` : '┐';
  return [['┌─ ', 'cadre'], [titre, 'cadre-titre'], [' ' + '─'.repeat(LARGEUR - [...debut].length - [...fin].length) + (droite ? ' ' : ''), 'cadre'], [droite, 'dim'], [droite ? ' ─┐' : '┐', 'cadre']];
}
function separation(titre) {
  const debut = `├─ ${titre} `;
  return [['├─ ', 'cadre'], [titre, 'cadre-titre'], [' ' + '─'.repeat(LARGEUR - [...debut].length - 1) + '┤', 'cadre']];
}
const bas = () => [['└' + '─'.repeat(LARGEUR - 2) + '┘', 'cadre']];
/** Une ligne de contenu, complétée par des espaces jusqu'au bord droit. */
function rangee(...morceaux) {
  const reste = INTERIEUR - longueur(morceaux);
  return [['│ ', 'cadre'], ...morceaux, [' '.repeat(Math.max(0, reste)) + ' │', 'cadre']];
}

function rangeeBarre(libelle, n, total, classe) {
  const [p, v] = barre(n, total);
  return rangee([libelle.slice(0, 10).padEnd(11), 'dim'], [p, classe], [v, 'vide'], [' ' + String(n).padStart(3), n ? classe : 'dim'], [pourcent(n, total).padStart(6), 'dim']);
}

/**
 * Le tableau de bord de la commande « stats ».
 * s = résultat de regles.statistiques() ; jour = « AAAA-MM-JJ » d'aujourd'hui.
 */
export function dessinerStats(s, jour) {
  const date = depuisJour(jour).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const lignes = [cadre('stats', date)];
  const total = s.total;
  lignes.push(rangee([String(total), 'fort'], [total > 1 ? ' dossiers' : ' dossier', 'dim']));

  lignes.push(separation('par type'));
  TYPES.forEach(t => lignes.push(rangeeBarre(t.libelle, s.parType[t.code], total, `ty-${t.code}`)));

  lignes.push(separation('statut DFT'));
  STATUTS.forEach(st => lignes.push(rangeeBarre(COURT[st.code] || st.libelle, s.parStatut[st.code], total, `st-${st.code}`)));

  // Avancement : la part des dossiers mis à disposition (clos)
  const clos = STATUTS.filter(st => st.clos).reduce((n, st) => n + s.parStatut[st.code], 0);
  const [p, v] = barre(clos, total, 20, '▓', '░');
  lignes.push(separation('avancement'));
  lignes.push(rangee(['[', 'dim'], [p, 'st-MAD'], [v, 'vide'], [']', 'dim'], [pourcent(clos, total).padStart(6), 'fort'], [' clos', 'dim']));

  // Alertes et relances des 7 prochains jours
  lignes.push(separation('relances'));
  const points = (n, classe) => [['●'.repeat(Math.min(n, 10)) + (n > 10 ? '+' : ''), classe]];
  lignes.push(rangee(['en retard   ', 'dim'], [String(s.retard).padStart(3) + ' ', s.retard ? 'retard' : 'dim'], ...points(s.retard, 'retard')));
  lignes.push(rangee(['sous 3 jours', 'dim'], [String(s.proche).padStart(3) + ' ', s.proche ? 'proche' : 'dim'], ...points(s.proche, 'proche')));
  lignes.push(rangee(['sans FCI    ', 'dim'], [String(s.sansFci).padStart(3), s.sansFci ? 'fort' : 'dim']));
  if (s.aVenir) {
    const initiales = s.aVenir.map((_, i) => depuisJour(ajouterJours(jour, i)).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase());
    const n = s.aVenir.reduce((a, b) => a + b, 0);
    lignes.push(rangee(['7 jours     ', 'dim'], [String(n).padStart(3) + ' ', n ? 'fort' : 'dim'], [etincelle(s.aVenir).join(' '), 'proche']));
    lignes.push(rangee([' '.repeat(16), ''], [initiales.join(' '), 'dim']));
  }
  lignes.push(bas());

  return {
    texte: lignes.map(l => l.map(([t]) => t).join('')),
    html: lignes.map(l => l.map(([t, c]) => c ? `<span class="${c}">${esc(t)}</span>` : esc(t)).join('')).join('\n')
  };
}
