/**
 * line.test.js — lien vers le dossier LINE (flashback.orange.fr).
 */
import { groupe, test, egal, vrai } from './outil.js';
import { lienLine } from '../js/line.js';
import { optionsDossier } from '../js/jarvis/menus.js';

groupe('Accès LINE', () => {
  test('l\'exemple : SBA401687-THF010', () => egal(lienLine('SBA401687-THF010').url,
    'https://flashback.orange.fr/line/dossier/travaux/consult/401687/SBA/Limousin%20Poitou%20Charentes/THF01-0/info-gene'));
  test('Aquitaine, autre fin', () => egal(lienLine('MED500010-ACF011').url,
    'https://flashback.orange.fr/line/dossier/travaux/consult/500010/MED/Aquitaine/ACF01-1/info-gene'));
  test('lettres inconnues : erreur claire', () => vrai(!lienLine('XYZ123456-THF010').ok && lienLine('XYZ123456-THF010').erreur.includes('région')));
  test('menu ⋯ : Accès LINE chrome et mozilla', () => {
    const o = optionsDossier({ gcblo: 'SBA401687-THF010', statutDft: 'A_FAIRE', type: 'AIR', fci: [] });
    egal(o.filter(x => x.libelle.startsWith('Accès LINE')).map(x => x.commande), ['line SBA401687-THF010 chrome', 'line SBA401687-THF010 mozilla']);
  });
});
