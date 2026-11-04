/**
 * tableau-bord.js — le tableau de bord récapitulatif, dessiné en caractères (ASCII),
 * toujours visible à droite de la console.
 *
 * Ne lit ni ne modifie aucune donnée : on lui donne les statistiques (dossiers.js),
 * il rend des lignes. Chaque ligne est une liste de morceaux [texte, classe CSS] ; on en tire
 *   - le texte brut (pour les tests : toutes les lignes ont la même largeur),
 *   - le HTML coloré (pour l'écran).
 *
 * Alignement : selon la police, certains caractères (█ ░ ● ▁…) n'ont pas exactement la
 * largeur d'une lettre et décaleraient le bord droit. À l'écran, chaque morceau est donc
 * posé dans une case d'une largeur fixe (en « ch », la largeur d'un caractère) ; les traits
 * horizontaux remplissent la place restante. Le cadre reste droit quelle que soit la police.
 *
 *   dessinerTableauBord(stats, jour) → { texte: [lignes], html }
 */
import { TYPES, STATUTS } from '../config.js';
import { depuisJour, ajouterJours } from '../dates.js';
import { formaterMontant } from '../dossiers.js';
import { MOTS_TYPE, MOTS_STATUT, motPourCode } from './grammaire.js';

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
  const fil = ['─'.repeat(LARGEUR - [...debut].length - [...fin].length), 'cadre fil'];
  return [['┌─ ', 'cadre'], [titre, 'cadre-titre'], [' ', ''], fil, ...(droite ? [[' ', ''], [droite, 'dim'], [' ─┐', 'cadre']] : [['┐', 'cadre']])];
}
function separation(titre) {
  const debut = `├─ ${titre} `;
  return [['├─ ', 'cadre'], [titre, 'cadre-titre'], [' ', ''], ['─'.repeat(LARGEUR - [...debut].length - 1), 'cadre fil'], ['┤', 'cadre']];
}
const bas = () => [['└', 'cadre'], ['─'.repeat(LARGEUR - 2), 'cadre fil'], ['┘', 'cadre']];
/** Une ligne de contenu, complétée par des espaces jusqu'au bord droit. */
function rangee(...morceaux) {
  const reste = INTERIEUR - longueur(morceaux);
  return [['│ ', 'cadre'], ...morceaux, [' '.repeat(Math.max(0, reste)), ''], [' │', 'cadre']];
}
function rangeeBarre(libelle, n, total, classe, commande) {
  const [p, v] = barre(n, total);
  return rangee([libelle.slice(0, 10).padEnd(11), 'dim', commande], [p, classe], [v, 'vide'], [' ' + String(n).padStart(4), n ? classe : 'dim'], [pourcent(n, total).padStart(6), 'dim']);
}
/** Libellé à gauche, montant aligné à droite. */
const rangeeMontant = (libelle, montant, classe = 'fort', commande) => rangee([libelle.padEnd(INTERIEUR - 16), 'dim', commande], [euros(montant).padStart(16), classe]);

/** « aujourd'hui 09:30 », « hier », « il y a 4 j », « jamais » ; en rouge au-delà de 7 jours. */
export function ageSauvegarde(iso, maintenant) {
  if (!iso) return ['jamais', 'retard'];
  const d = new Date(iso), jours = Math.floor((new Date(maintenant).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const texte = jours <= 0 ? `aujourd'hui ${heure}` : jours === 1 ? `hier ${heure}` : `il y a ${jours} j`;
  return [texte, jours > 7 ? 'retard' : jours > 2 ? 'proche' : 'st-ATTACH'];
}

export function dessinerTableauBord(s, jour, { derniereSauvegarde = undefined, maintenant = new Date() } = {}) {
  const date = depuisJour(jour).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  const total = s.total;
  const lignes = [cadre('tableau de bord', date)];
  lignes.push(rangee([String(total), 'fort', 'ls'], [total > 1 ? ' dossiers' : ' dossier', 'dim', 'ls']));

  lignes.push(separation('affect'));
  TYPES.forEach(t => lignes.push(rangeeBarre(t.libelle, s.parType[t.code], total, `ty-${t.code}`, `ls ${motPourCode(MOTS_TYPE, t.code)}`)));
  if (s.parType.SANS) lignes.push(rangeeBarre('Sans aff.', s.parType.SANS, total, 'proche', 'ls sans-affect'));

  lignes.push(separation('statut DFT'));
  STATUTS.forEach(st => lignes.push(rangeeBarre(COURT[st.code] || st.libelle, s.parStatut[st.code], total, `st-${st.code}`, `ls ${motPourCode(MOTS_STATUT, st.code)}`)));

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
    lignes.push(rangeeMontant('attaché', attache, attache ? 'st-ATTACH' : 'dim', 'ls attach'));
    lignes.push(rangeeMontant('à attacher', Math.round((s.valo.total - attache - annule) * 100) / 100));
    if (s.valo.sans) lignes.push(rangee(['sans valo'.padEnd(INTERIEUR - 16), 'dim', 'ls sans-valo'], [String(s.valo.sans).padStart(16), 'proche']));
  }

  // Alertes et relances des 7 prochains jours
  lignes.push(separation('relances'));
  const points = (n, classe) => [['●'.repeat(Math.min(n, 10)) + (n > 10 ? '+' : ''), classe]];
  lignes.push(rangee(['en retard   ', 'dim', 'ls retard'], [String(s.retard).padStart(4) + ' ', s.retard ? 'retard' : 'dim'], ...points(s.retard, 'retard')));
  lignes.push(rangee(['sous 3 jours', 'dim', 'ls proches'], [String(s.proche).padStart(4) + ' ', s.proche ? 'proche' : 'dim'], ...points(s.proche, 'proche')));
  lignes.push(rangee(['sans FCI    ', 'dim', 'ls sans-fci'], [String(s.sansFci).padStart(4), s.sansFci ? 'fort' : 'dim']));
  if (s.fciRetard !== undefined) lignes.push(rangee(['FCI > 24 h  ', 'dim', 'ls fci-retard'], [String(s.fciRetard).padStart(4), s.fciRetard ? 'retard' : 'dim']));
  if (s.aVenir) {
    const initiales = s.aVenir.map((_, i) => depuisJour(ajouterJours(jour, i)).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase());
    const n = s.aVenir.reduce((a, b) => a + b, 0);
    lignes.push(rangee(['7 jours     ', 'dim'], [String(n).padStart(4) + ' ', n ? 'fort' : 'dim'], [etincelle(s.aVenir).join(' '), 'proche']));
    lignes.push(rangee([' '.repeat(17), ''], [initiales.join(' '), 'dim']));
  }
  // Dernière sauvegarde (cliquable : lance « sauvegarde »)
  if (derniereSauvegarde !== undefined) {
    const [texte, classe] = ageSauvegarde(derniereSauvegarde, maintenant);
    lignes.push(separation('sauvegarde'));
    lignes.push(rangee(['dernière    ', 'dim', 'sauvegarde'], [texte, classe, 'sauvegarde']));
  }
  lignes.push(bas());

  return {
    texte: lignes.map(l => l.map(([t]) => t).join('')),
    // Une ligne = une rangée de cases de largeur fixe ; les traits (fil) prennent la place restante
    // Un morceau peut porter une commande (3e élément) : un clic la lance (un clic = une commande)
    html: lignes.map(l => `<div class="bl">${l.map(([t, c, cmd]) => /\bfil\b/.test(c)
      ? `<span class="${c}">${esc('─'.repeat(LARGEUR))}</span>`
      : `<span class="m ${c}${cmd ? ' cliquable' : ''}" style="width:calc(${[...t].length} * var(--ch))"${cmd ? ` data-commande="${esc(cmd)}" title="${esc(cmd)}"` : ''}>${esc(t)}</span>`).join('')}</div>`).join('')
  };
}
