/**
 * tableau-bord.js — le tableau de bord récapitulatif, dessiné en caractères (ASCII),
 * toujours visible à droite de la console.
 *
 * Ne lit ni ne modifie aucune donnée : on lui donne les statistiques (dossiers.js),
 * il rend des lignes. Chaque ligne est une liste de morceaux [texte, classe CSS] ; on en tire
 *   - le texte brut (pour les tests : toutes les lignes ont la même largeur),
 *   - le HTML coloré (pour l'écran).
 *
 *   dessinerTableauBord(stats, jour) → { texte: [lignes], html }
 */
import { TYPES, STATUTS } from '../config.js';
import { depuisJour, ajouterJours } from '../dates.js';
import { formaterMontant } from '../dossiers.js';

export const LARGEUR = 40;
const INTERIEUR = LARGEUR - 4;        // « │ » + contenu + « │ »
const BARRE = 14;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Libellés courts, pour garder l'alignement. */
const COURT = { A_FAIRE: 'À faire', EN_VALIDATION: 'En valid.', MAD: 'Mis à disp', REFUSE: 'Refusé', LITIGE: 'Litige', ANNULE: 'Annulé', ATTACH: 'Attach' };

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
const euros = v => formaterMontant(v).replace(/\s/g, ' ');

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
  return rangee([libelle.slice(0, 10).padEnd(11), 'dim'], [p, classe], [v, 'vide'], [' ' + String(n).padStart(4), n ? classe : 'dim'], [pourcent(n, total).padStart(6), 'dim']);
}
/** Libellé à gauche, montant aligné à droite. */
const rangeeMontant = (libelle, montant, classe = 'fort') => rangee([libelle.padEnd(INTERIEUR - 16), 'dim'], [euros(montant).padStart(16), classe]);

export function dessinerTableauBord(s, jour) {
  const date = depuisJour(jour).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const total = s.total;
  const lignes = [cadre('tableau de bord', date)];
  lignes.push(rangee([String(total), 'fort'], [total > 1 ? ' dossiers' : ' dossier', 'dim']));

  lignes.push(separation('affect'));
  TYPES.forEach(t => lignes.push(rangeeBarre(t.libelle, s.parType[t.code], total, `ty-${t.code}`)));

  lignes.push(separation('statut DFT'));
  STATUTS.forEach(st => lignes.push(rangeeBarre(COURT[st.code] || st.libelle, s.parStatut[st.code], total, `st-${st.code}`)));

  // Avancement : la part des dossiers clos (mis à disposition, annulés, attachés)
  const clos = STATUTS.filter(st => st.clos).reduce((n, st) => n + s.parStatut[st.code], 0);
  const [p, v] = barre(clos, total, 22, '▓', '░');
  lignes.push(separation('avancement'));
  lignes.push(rangee(['[', 'dim'], [p, 'st-MAD'], [v, 'vide'], [']', 'dim'], [pourcent(clos, total).padStart(6), 'fort'], [' clos', 'dim']));

  // Valorisation : total, déjà attaché, reste à attacher (hors annulés)
  if (s.valo) {
    const attache = s.valo.parStatut.ATTACH || 0, annule = s.valo.parStatut.ANNULE || 0;
    lignes.push(separation('valorisation'));
    lignes.push(rangeeMontant('total', s.valo.total));
    lignes.push(rangeeMontant('attaché', attache, attache ? 'st-ATTACH' : 'dim'));
    lignes.push(rangeeMontant('à attacher', Math.round((s.valo.total - attache - annule) * 100) / 100));
    if (s.valo.sans) lignes.push(rangee(['sans valo'.padEnd(INTERIEUR - 16), 'dim'], [String(s.valo.sans).padStart(16), 'proche']));
  }

  // Alertes et relances des 7 prochains jours
  lignes.push(separation('relances'));
  const points = (n, classe) => [['●'.repeat(Math.min(n, 10)) + (n > 10 ? '+' : ''), classe]];
  lignes.push(rangee(['en retard   ', 'dim'], [String(s.retard).padStart(4) + ' ', s.retard ? 'retard' : 'dim'], ...points(s.retard, 'retard')));
  lignes.push(rangee(['sous 3 jours', 'dim'], [String(s.proche).padStart(4) + ' ', s.proche ? 'proche' : 'dim'], ...points(s.proche, 'proche')));
  lignes.push(rangee(['sans FCI    ', 'dim'], [String(s.sansFci).padStart(4), s.sansFci ? 'fort' : 'dim']));
  if (s.aVenir) {
    const initiales = s.aVenir.map((_, i) => depuisJour(ajouterJours(jour, i)).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase());
    const n = s.aVenir.reduce((a, b) => a + b, 0);
    lignes.push(rangee(['7 jours     ', 'dim'], [String(n).padStart(4) + ' ', n ? 'fort' : 'dim'], [etincelle(s.aVenir).join(' '), 'proche']));
    lignes.push(rangee([' '.repeat(17), ''], [initiales.join(' '), 'dim']));
  }
  lignes.push(bas());

  return {
    texte: lignes.map(l => l.map(([t]) => t).join('')),
    html: lignes.map(l => l.map(([t, c]) => c ? `<span class="${c}">${esc(t)}</span>` : esc(t)).join('')).join('\n')
  };
}
