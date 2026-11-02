/**
 * ameliorations.test.js — point du jour (R8), création en lot et collage (R9),
 * relance groupée et destinataires par type (R4). Lundi 02/11/2026.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { creerReglages, estEmail } from '../js/reglages.js';
import { lireCollage, ressembleAUneListe } from '../js/collage.js';
import { analyser } from '../js/jarvis/analyse.js';
import { proposer, apercu } from '../js/jarvis/completion.js';

const MAINTENANT = new Date(2026, 10, 2, 10, 0);
const AUJ = '2026-11-02';

function env() {
  const store = creerStore(supportMemoire());
  const regles = creerDossiers(store, { horloge: () => MAINTENANT });
  const reglages = creerReglages(supportMemoire());
  regles.creer({ type: 'NUM21', gcblo: 'SBA501404-THF010', fci: 'F26154200726', dateRelance: '2026-10-30' });        // retard
  regles.creer({ type: 'AIR', gcblo: 'SBA501423-THF010', fci: '', dateRelance: '2026-10-31' });                       // retard
  regles.creer({ type: 'AIR', gcblo: 'LRO500767-THF010', fci: 'F09075260926', dateRelance: AUJ });                     // aujourd'hui
  regles.creer({ type: 'SOGETREL', gcblo: 'EST501479-THF011', fci: '', dateRelance: '2026-11-04' });                  // proche
  regles.creer({ type: 'NUM21', gcblo: 'BOR600309-THF010', fci: '', statutDft: 'REFUSE' });                           // refusé
  regles.creer({ type: 'NUM21', gcblo: 'POI500553-THF010', fci: '', statutDft: 'MAD', dateRelance: '2026-10-01' });  // clos
  const ctx = { dossiers: store.tous(), aujourdhui: AUJ, regles, reglages, recents: [] };
  return { store, regles, reglages, ctx };
}

groupe('R8 — Point du jour', () => {
  test('les quatre listes', () => {
    const p = env().regles.pointDuJour();
    egal([p.retard, p.aujourdhui, p.proches, p.refuses].map(l => l.map(d => d.gcblo)),
      [['SBA501404-THF010', 'SBA501423-THF010'], ['LRO500767-THF010'], ['EST501479-THF011'], ['BOR600309-THF010']]);
  });
  test('un dossier clos n\'apparaît jamais', () => vrai(!JSON.stringify(env().regles.pointDuJour()).includes('POI500553')));
});

groupe('R9 — Création en lot', () => {
  test('crée les valides en un seul enregistrement, liste les refus', () => {
    const { regles, store } = env();
    let ecritures = 0; store.ecouter(() => ecritures++);
    const r = regles.creerPlusieurs([
      { type: 'AIR', gcblo: 'AAA111111-THF010', fci: ['F11111111111'] },
      { type: 'AIR', gcblo: 'SBA501404-THF010' },                  // déjà présent
      { type: 'AIR', gcblo: 'AAA111111-THF010' },                  // en double dans le lot
      { type: '', gcblo: 'BBB222222-THF010' }                      // sans type
    ]);
    egal(r.crees.map(d => d.gcblo), ['AAA111111-THF010']); egal(r.refuses.length, 3); egal(ecritures, 1);
  });
  test('tout le lot s\'annule d\'un coup', () => {
    const { regles, store } = env();
    const n = store.tous().length;
    const r = regles.creerPlusieurs([{ type: 'AIR', gcblo: 'AAA111111-THF010' }, { type: 'AIR', gcblo: 'AAA222222-THF010' }]);
    regles.supprimer(...r.crees.map(d => d.id));
    egal(store.tous().length, n);
  });
});

groupe('Collage d\'une liste', () => {
  test('une liste de GCBLO avec leurs FCI', () => {
    const l = lireCollage('SBA202020-THF010 F12345678901\nsba202021-thf010\nSBA202022 THF010  F22222222222, F33333333333');
    egal(l.nouveaux.map(n => [n.gcblo, n.fci.length]), [['SBA202020-THF010', 1], ['SBA202021-THF010', 0], ['SBA202022-THF010', 2]]);
  });
  test('le type écrit sur la ligne est repris', () => egal(lireCollage('SBA202020-THF010 AIR\nSBA202021-THF010 numerus 21').nouveaux.map(n => n.type), ['AIR', 'NUM21']));
  test('sans type : null (il sera demandé une fois)', () => egal(lireCollage('SBA202020-THF010').nouveaux[0].type, null));
  test('déjà présents et doublons sont séparés', () => {
    const { store } = env();
    const l = lireCollage('SBA501404-THF010\nSBA202020-THF010\nSBA202020-THF010 F12345678901', store.tous());
    egal([l.nouveaux.length, l.existants.length, l.doublons.length], [1, 1, 1]);
    egal(l.nouveaux[0].fci, ['F12345678901'], 'les FCI du doublon complètent le premier');
  });
  test('lignes sans GCBLO signalées, lignes vides ignorées', () => egal(lireCollage('bonjour\n\nSBA202020-THF010').illisibles, ['bonjour']));
  test('classeur robot : chaque colonne GCBLO donne son type', () => {
    const texte = 'AFFECTATION GCBLO NUM21\t\tAFFECTATION GCBLO AIR\t\t\tGCBLO NUM21\tFCI\t\tGCBLO AIR\tFCI\n'
      + 'EST501479-THF011\t\tSBA501404-THF010\t\t\tSBA300497-THF010\tF22892160726\t\tSBA501588-THF010\tF26154200726\n'
      + '\t\t\t\t\tSBA501666-THF010\tF23026160726\t\tSBA600537-THF010\tPas de GCBLO\n'
      + '\t\t\t\t\tSBA501404-THF010\t?';
    const l = lireCollage(texte);
    const vu = Object.fromEntries(l.nouveaux.map(n => [n.gcblo, `${n.type} ${n.fci.join(',')}`.trim()]));
    egal(vu['EST501479-THF011'], 'NUM21');
    egal(vu['SBA501404-THF010'], 'NUM21', 'les colonnes de liste passent avant les cases de saisie du robot');
    egal(vu['SBA300497-THF010'], 'NUM21 F22892160726');
    egal(vu['SBA501588-THF010'], 'AIR F26154200726');
    egal(vu['SBA600537-THF010'], 'AIR', '« Pas de GCBLO » = pas de FCI');
    egal(l.doublons, ['SBA501404-THF010']);
    egal(l.conflits, [], 'liste NUM21 + case de saisie AIR : pas un vrai conflit');
  });
  test('un simple GCBLO collé n\'est pas une liste', () => { vrai(!ressembleAUneListe('SBA202020-THF010')); vrai(ressembleAUneListe('SBA202020-THF010\nSBA202021-THF010')); });
});

groupe('R4 — Relance groupée et destinataires', () => {
  test('email groupé : objet et une ligne par dossier', () => {
    const { regles, store } = env();
    const m = regles.email(store.tous().slice(0, 2));
    egal(m.objet, 'Relance dossiers (2)');
    vrai(m.corps.includes('- SBA501404-THF010 — FCI : F26154200726') && m.corps.includes('- SBA501423-THF010 — FCI : aucun'));
  });
  test('noter la relance de plusieurs dossiers en une fois', () => {
    const { regles, store } = env();
    const ids = store.tous().slice(0, 3).map(d => d.id);
    egal(regles.noterRelances(ids).notes, 3);
    vrai(ids.every(id => store.parId(id).historique.at(-1).action === 'relance'));
  });
  test('destinataire par type', () => {
    const { reglages } = env();
    vrai(reglages.definirDestinataire('AIR', 'jean.dupont@exemple.fr').ok);
    egal(reglages.destinataire('AIR'), 'jean.dupont@exemple.fr'); egal(reglages.destinataire('NUM21'), '');
  });
  test('adresse invalide refusée', () => { vrai(!env().reglages.definirDestinataire('AIR', 'jean.dupont').ok); vrai(estEmail('a.b@c.fr')); });
  test('« relance retard » vise tous les dossiers en retard', () => {
    const { ctx } = env();
    const a = analyser('relance retard', 14, ctx);
    vrai(a.complet); egal(a.valeurs.cibles.map(d => d.gcblo), ['SBA501404-THF010', 'SBA501423-THF010']);
  });
  test('groupe + dossier, sans doublon', () => egal(analyser('relance retard 501404 lundi', 27, env().ctx).valeurs.cibles.length, 2));
  test('un groupe est refusé là où un seul dossier est attendu', () => vrai(analyser('ouvre retard ', 13, env().ctx).erreurs[0].includes('groupe')));
  test('le groupe est proposé avec son effectif', () => {
    const p = proposer(analyser('relance ', 8, env().ctx), env().ctx).propositions;
    egal([p[0].libelle, p[0].detail], ['retard', 'groupe · 2 dossiers en retard']);
  });
  test('aperçu : emails par destinataire et types sans destinataire', () => {
    const { ctx, reglages } = env();
    reglages.definirDestinataire('AIR', 'air@exemple.fr');
    egal(apercu(analyser('relance retard', 14, ctx), ctx), '→ 2 emails récapitulatifs pour 2 dossiers · sans destinataire : NUM21');
  });
  test('commande email : type puis adresse', () => {
    const { ctx } = env();
    const a = analyser('email air jean.dupont@exemple.fr', 33, ctx);
    vrai(a.complet); egal([a.valeurs.type, a.valeurs.adresse], ['AIR', 'jean.dupont@exemple.fr']);
    egal(analyser('email air aucun', 15, ctx).valeurs.adresse, '');
  });
  test('même GCBLO dans deux listes de types différents : conflit signalé', () => {
    const l = lireCollage('GCBLO NUM21\tFCI\t\tGCBLO AIR\tFCI\nSBA501404-THF010\t\t\tSBA501423-THF010\nSBA111111-THF010\t\t\tSBA501404-THF010');
    egal(l.conflits, [{ gcblo: 'SBA501404-THF010', garde: 'NUM21', autre: 'AIR' }]);
  });
});
