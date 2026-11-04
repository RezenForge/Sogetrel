/**
 * info.test.js — retrouver des dossiers à partir d'une liste collée.
 */
import { groupe, test, egal } from './outil.js';
import { chercherListe } from '../js/info.js';

const D = ['SBA501404-THF010', 'SBA501423-THF010', 'LRO500767-THF010', 'LRO500768-THF010'].map((gcblo, i) => ({ id: String(i), gcblo }));
const noms = r => r.trouves.map(d => d.gcblo);

groupe('info — liste collée', () => {
  test('colonne Excel : dans l\'ordre collé, sans doublon', () => {
    const r = chercherListe('LRO500767-THF010 SBA501404-THF010 LRO500767-THF010', D);
    egal(noms(r), ['LRO500767-THF010', 'SBA501404-THF010']);
  });
  test('écritures tolérées : minuscules, sans tiret, espaces autour du tiret', () =>
    egal(noms(chercherListe('sba501404thf010 SBA501423 - THF010', D)), ['SBA501404-THF010', 'SBA501423-THF010']));
  test('introuvables listés à part', () => {
    const r = chercherListe('SBA501404-THF010 ABC123456-DEF789', D);
    egal([noms(r), r.introuvables], [['SBA501404-THF010'], ['ABC123456-DEF789']]);
  });
  test('morceau de numéro : retenu seulement s\'il désigne un seul dossier', () => {
    const r = chercherListe('501423 5007', D);
    egal([noms(r), r.ambigus], [['SBA501423-THF010'], ['5007']]);
  });
  test('en-tête et texte ignorés', () => {
    const r = chercherListe('GCBLO SBA501404-THF010 dossier', D);
    egal([noms(r), r.ignores], [['SBA501404-THF010'], 2]);
  });
  test('colonne recollée bout à bout par le navigateur', () =>
    egal(noms(chercherListe('SBA501404-THF010SBA501423-THF010LRO500767-THF010', D)), ['SBA501404-THF010', 'SBA501423-THF010', 'LRO500767-THF010']));
  test('tiret long ou insécable (copié de Word, d\'un mail)', () => egal(noms(chercherListe('SBA501404–THF010 SBA501423‑THF010 LRO-500767-THF010', D)).length, 3));
  test('GCBLO entouré de texte (« Dossier SBA501404-THF010 : ok »)', () => egal(noms(chercherListe('Dossier SBA501404-THF010 : ok', D)), ['SBA501404-THF010']));
  test('séparateurs : virgules, points-virgules, tabulations', () => egal(noms(chercherListe('SBA501404-THF010;SBA501423-THF010,\tLRO500768-THF010', D)).length, 3));
});
