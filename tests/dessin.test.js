/**
 * dessin.test.js — le tableau de bord ASCII de « stats ».
 * Ce qui compte : toutes les lignes ont exactement la même largeur (sinon le cadre se casse),
 * et les chiffres affichés sont les bons.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { dessinerStats, barre, etincelle, LARGEUR } from '../js/jarvis/dessin.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';

const S = { total: 85, parType: { NUM21: 52, AIR: 30, SOGETREL: 3 }, parStatut: { A_FAIRE: 40, EN_VALIDATION: 20, MAD: 22, REFUSE: 3 },
  retard: 14, proche: 2, sansFci: 7, aVenir: [2, 0, 5, 1, 0, 0, 3] };
const largeur = l => [...l].length;

groupe('Dessin ASCII — stats', () => {
  test('toutes les lignes ont la même largeur', () => {
    const { texte } = dessinerStats(S, '2026-11-02');
    egal(texte.filter(l => largeur(l) !== LARGEUR), []);
  });
  test('largeur tenue aussi sans aucun dossier', () => {
    const vide = { total: 0, parType: { NUM21: 0, AIR: 0, SOGETREL: 0 }, parStatut: { A_FAIRE: 0, EN_VALIDATION: 0, MAD: 0, REFUSE: 0 }, retard: 0, proche: 0, sansFci: 0, aVenir: [0, 0, 0, 0, 0, 0, 0] };
    egal(dessinerStats(vide, '2026-11-02').texte.filter(l => largeur(l) !== LARGEUR), []);
  });
  test('cadre fermé, date et sections', () => {
    const t = dessinerStats(S, '2026-11-02').texte;
    vrai(t[0].startsWith('┌─ stats') && t[0].includes('lun 02/11') && t.at(-1).startsWith('└'));
    vrai(['par type', 'statut DFT', 'avancement', 'relances'].every(s => t.some(l => l.includes(s))));
  });
  test('chiffres et pourcentages', () => {
    const t = dessinerStats(S, '2026-11-02').texte;
    vrai(t.some(l => l.includes('NUM21') && l.includes(' 52') && l.includes('61 %')));
    vrai(t.some(l => l.includes('26 %') && l.includes('clos')));        // 22 MAD sur 85
    vrai(t.some(l => l.includes('en retard') && l.includes('●●●●●●●●●●+')));
  });
  test('les 7 jours commencent aujourd\'hui (lundi)', () => vrai(dessinerStats(S, '2026-11-02').texte.some(l => l.includes('L M M J V S D'))));
  test('barre : au moins un bloc dès qu\'il y a un dossier', () => { egal(barre(1, 1000, 10)[0], '█'); egal(barre(0, 10, 10)[0], ''); egal(barre(5, 10, 10)[0].length, 5); });
  test('étincelle : rien = point, le max = bloc plein', () => egal(etincelle([0, 1, 4]).join(''), '·▂█'));
  test('le HTML échappe et colore', () => { const h = dessinerStats(S, '2026-11-02').html; vrai(h.includes('class="ty-AIR"') && h.includes('class="retard"') && !h.includes('<script')); });
});

groupe('Statistiques — relances à venir', () => {
  test('compte les relances des 7 jours, sans les dossiers clos ni le retard', () => {
    const store = creerStore(supportMemoire());
    const r = creerDossiers(store, { horloge: () => new Date(2026, 10, 2, 9) });
    const mk = (g, rel, statut) => { const res = r.creer({ gcblo: g, type: 'NUM21', dateAffectation: '2026-10-01', dateRelance: rel }); if (statut) r.modifier(res.dossier.id, { statutDft: statut }); };
    mk('SBA000001-THF001', '2026-11-02'); mk('SBA000002-THF001', '2026-11-04'); mk('SBA000003-THF001', '2026-11-04');
    mk('SBA000004-THF001', '2026-11-08'); mk('SBA000005-THF001', '2026-11-09'); mk('SBA000006-THF001', '2026-10-30');
    mk('SBA000007-THF001', '2026-11-03', 'MAD');
    egal(r.statistiques().aVenir, [1, 0, 2, 0, 0, 0, 1]);
  });
});
