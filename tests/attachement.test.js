/**
 * attachement.test.js — R11 : remplissage de l'attachement d'un dossier.
 * La référence d'essai (donnees/attachement-reference.xlsx) est fictive : cellules
 * fusionnées, date au format date, formules qui dépendent des cellules remplies.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { cellulesAttachement, palierPour } from '../js/attachement.js';
import { lireClasseur, modifierClasseur } from '../js/xlsx.js';

const reference = fetch(new URL('./donnees/attachement-reference.xlsx', import.meta.url)).then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
const dossier = (valorisation, commune = 'Mérignac') => ({ gcblo: 'SBA501404-THF010', commune, valorisation });

groupe('R11 — Paliers selon la valorisation', () => {
  test('proche de 30 → ANNEX', () => egal([28, 30, 33.5, 45].map(v => palierPour(v)?.nom), ['ANNEX', 'ANNEX', 'ANNEX', 'ANNEX']));
  test('proche de 60 → ANNEX + BLOCS', () => egal([46, 58, 60, 75].map(v => palierPour(v)?.nom), ['ANNEX + BLOCS', 'ANNEX + BLOCS', 'ANNEX + BLOCS', 'ANNEX + BLOCS']));
  test('trop loin des deux, ou vide → aucun', () => egal([10, 100, null, undefined].map(v => palierPour(v)), [null, null, null, null]));
});

groupe('R11 — Cellules à remplir', () => {
  test('palier 30', () => egal(cellulesAttachement(dossier(31), '2026-11-03').cellules,
    { AG5: { date: '2026-11-03' }, U6: 'SBA501404-THF010', X5: 'Mérignac', A30: 'ANNEX', AB30: 1 }));
  test('palier 60 : ANNEX et BLOCS', () => {
    const c = cellulesAttachement(dossier(59), '2026-11-03').cellules;
    egal([c.A30, c.AB30, c.A31, c.AB31], ['ANNEX', 1, 'BLOCS', 1]);
  });
  test('sans commune ni valorisation : signalé, rien d\'inventé', () => {
    const r = cellulesAttachement(dossier(null, ''), '2026-11-03');
    egal(Object.keys(r.cellules).sort(), ['AG5', 'U6']);
    egal(r.avertissements.length, 2);
  });
});

groupe('R11 — Copie du classeur de référence', () => {
  test('cellules remplies, sur la première feuille', async () => {
    const sortie = await modifierClasseur(await reference, { cellules: cellulesAttachement(dossier(59), '2026-11-03').cellules });
    const c = (await lireClasseur(sortie)).feuilles.Attachement;
    const cell = ref => { const [, l, n] = ref.match(/^([A-Z]+)(\d+)$/); return c.find(r => r.numero === Number(n))?.cellules[l]; };
    egal([cell('X5'), cell('U6'), cell('A30'), cell('AB30'), cell('A31'), cell('AB31')], ['Mérignac', 'SBA501404-THF010', 'ANNEX', 1, 'BLOCS', 1]);
    egal(cell('AG5'), 46329);                   // 03/11/2026 en jour Excel : la cellule est au format date
    egal(cell('T5'), 'Commune :');              // le reste est intact
  });
  test('l\'autre feuille et la référence ne sont pas touchées', async () => {
    const ref = await reference, avant = ref.slice();
    const sortie = await modifierClasseur(ref, { cellules: { U6: 'X' } });
    egal((await lireClasseur(sortie)).feuilles.Prix[0].cellules.A, 'ANNEX');
    vrai(ref.every((o, i) => o === avant[i]));
  });
  test('cellule et ligne absentes : créées à leur place', async () => {
    const sortie = await modifierClasseur(await reference, { cellules: { B50: 'fin', C2: 'haut' } });
    const lignes = (await lireClasseur(sortie)).feuilles.Attachement;
    egal(lignes.map(l => l.numero), [...lignes.map(l => l.numero)].sort((a, b) => a - b));
    egal([lignes.find(l => l.numero === 50).cellules.B, lignes.find(l => l.numero === 2).cellules.C], ['fin', 'haut']);
  });
});
