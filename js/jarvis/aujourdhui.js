/**
 * aujourdhui.js — l'écran « Aujourd'hui » (commande `today`, affiché à l'ouverture) :
 * ce qui demande une action, en cartes. Chaque carte = une commande `ls` (clic sur l'en-tête),
 * avec tous les dossiers concernés (liste défilable) et, pour chacun, l'action utile en un clic.
 *
 *   CARTES : définition des cartes, dans l'ordre d'urgence
 *     { commande, libelle, conseil, classe, indice(d, ctx) → texte, actions(d, ctx) → [[libellé, commande]] }
 *   pointDuJour(stats, { ecartsAffect }) → les cartes à afficher avec leur nombre (d'après les statistiques)
 *   carteHtml(carte, dossiers, ctx, esc) → HTML d'une carte (tous les dossiers, liste défilable)
 */
import { typeParCode } from '../config.js';
import { formater, ecartJours, versJour } from '../dates.js';
import { lireType } from '../import-excel.js';
import { relanceRecente } from '../dossiers.js';

/** Bouton de relance : « ✓ relancé » (atténué) si la même relance est récente (protection anti-doublon). */
const relancer = (d, motif, jour) => relanceRecente(d, motif, jour) ? [`✓ relancé ${motif.toUpperCase()}`, `relance ${d.gcblo} ${motif}`, 'fait'] : [`relancer ${motif.toUpperCase()}`, `relance ${d.gcblo} ${motif}`];

const AFFECTS_MAIL = ['NUM21', 'AIR'];
const depuis = (jour, iso) => { if (!iso) return ''; const n = ecartJours(jour, iso.length > 10 ? versJour(new Date(iso)) : iso); return n <= 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${n} j`; };

export const CARTES = Object.freeze([
  { commande: 'ls fci-retard', libelle: 'FCI en retard', conseil: 'affectés depuis plus de 24 h, sans FCI', classe: 'retard', stat: s => s.fciRetard,
    indice: (d, c) => `affecté ${depuis(c.jour, d.dateAffectation)}`,
    actions: (d, c) => [relancer(d, 'fci', c.jour)] },
  { commande: 'ls retard', libelle: 'Relances en retard', conseil: 'date de relance dépassée', classe: 'retard', stat: s => s.retard,
    indice: d => d.dateRelance ? `prévue le ${formater(d.dateRelance).slice(0, 5)}` : '',
    actions: (d, c) => AFFECTS_MAIL.includes(d.type) ? [relancer(d, 'dft', c.jour)] : [] },
  { commande: 'ls litige', libelle: 'En litige', conseil: 'à suivre', classe: 'st-LITIGE', stat: s => s.parStatut?.LITIGE,
    indice: (d, c) => `depuis ${depuis(c.jour, d.modifieLe)}`.replace('depuis il y a', 'depuis'),
    actions: d => [['ouvrir', `open ${d.gcblo}`]] },
  { commande: 'ls refuse', libelle: 'Refusés', conseil: 'à reprendre', classe: 'st-REFUSE', stat: s => s.parStatut?.REFUSE,
    indice: (d, c) => `refusé ${depuis(c.jour, d.modifieLe)}`,
    actions: d => [['ouvrir', `open ${d.gcblo}`]] },
  { commande: 'ls ecart-affect', libelle: 'Affect ≠ colonne I', conseil: 'le classeur partagé dit autre chose', classe: 'proche', stat: (s, o) => o.ecartsAffect,
    indice: (d, c) => `registre ${typeParCode(d.type)?.libelle || '—'} · colonne I ${(c.affects?.[d.gcblo] || []).join(' / ')}`,
    actions: (d, c) => {
      const codes = [...new Set((c.affects?.[d.gcblo] || []).map(lireType).filter(Boolean))];
      return codes.length === 1 ? [[`→ ${typeParCode(codes[0]).libelle}`, `set ${d.gcblo} to ${codes[0].toLowerCase()}`]] : [['ouvrir', `open ${d.gcblo}`]];
    } },
  { commande: 'ls sans-affect', libelle: 'Sans affect', conseil: 'à affecter (le mail se prépare)', classe: 'proche', stat: s => s.parType?.SANS,
    indice: d => d.commune || '',
    actions: d => [['NUM21', `affect ${d.gcblo} num21`], ['AIR', `affect ${d.gcblo} air`]] },
  { commande: 'ls proches', libelle: 'Relances sous 3 jours', conseil: 'à anticiper', classe: 'proche', stat: s => s.proche,
    indice: d => d.dateRelance ? `le ${formater(d.dateRelance).slice(0, 5)}` : '',
    actions: (d, c) => AFFECTS_MAIL.includes(d.type) ? [relancer(d, 'dft', c.jour)] : [] }
]);

/** Les cartes à afficher (nombre > 0) d'après les statistiques. → [{ n, libelle, commande, classe, conseil }] */
export function pointDuJour(s, opts = {}) {
  return CARTES.map(c => ({ n: c.stat(s, { ecartsAffect: 0, ...opts }) || 0, libelle: c.libelle, commande: c.commande, classe: c.classe, conseil: c.conseil })).filter(l => l.n > 0);
}

/** Hauteur visible d'une carte, en lignes de dossiers ; au-delà, la liste défile dans la carte. */
export const LIGNES_VISIBLES = 6;

export function carteHtml(carte, dossiers, ctx, esc) {
  const lignes = dossiers.map(d => {
    const actions = carte.actions(d, ctx).map(([lib, cmd, etat]) => `<button type="button" class="jc-action${etat ? ' ' + etat : ''}" data-commande="${esc(cmd)}" title="${esc(cmd)}">${esc(lib)}</button>`).join('');
    return `<div class="jc-ligne">`
      + `<button type="button" class="jc-gcblo lien" data-commande="open ${esc(d.gcblo)}" data-copie="${esc(d.gcblo)}" title="open ${esc(d.gcblo)}">${esc(d.gcblo)}</button>`
      + `<span class="jc-affect ty-${d.type || 'SANS'}">${esc(typeParCode(d.type)?.libelle || '—')}</span>`
      + `<span class="jc-indice dim" title="${esc(carte.indice(d, ctx) || '')}">${esc(carte.indice(d, ctx) || '')}</span>`
      + `<span class="jc-actions">${actions}</span></div>`;
  }).join('');
  return `<section class="jc" data-niveau="${carte.classe}">`
    + `<button type="button" class="jc-tete" data-commande="${esc(carte.commande)}" title="${esc(carte.commande)}">`
    + `<span class="jc-n">${dossiers.length}</span><span class="jc-titres"><span class="jc-libelle">${esc(carte.libelle)}</span><span class="jc-conseil dim">${esc(carte.conseil)}</span></span><span class="jc-voir">liste →</span></button>`
    // Tous les dossiers, dans une liste qui défile à l'intérieur de la carte au-delà de LIGNES_VISIBLES
    + `<div class="jc-corps${dossiers.length > LIGNES_VISIBLES ? ' defile' : ''}" style="--lignes:${LIGNES_VISIBLES}">${lignes}</div>`
    + '</section>';
}
