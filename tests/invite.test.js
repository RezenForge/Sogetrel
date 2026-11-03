/**
 * invite.test.js — tests du moteur de l'invite (analyse + autocomplétion).
 * Les commandes ont été retirées le 03/11/2026 : on teste la lecture des mots et des dates.
 * Mêmes conditions que regles.test.js : store en mémoire, lundi 02/11/2026.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { analyser, lireDate, decouper } from '../js/jarvis/analyse.js';
import { proposer } from '../js/jarvis/completion.js';

const MAINTENANT = new Date(2026, 10, 2, 10, 0);
const AUJ = '2026-11-02';

function contexte() {
  const store = creerStore(supportMemoire());
  const regles = creerDossiers(store, { horloge: () => MAINTENANT });
  regles.creer({ type: 'NUM21', gcblo: 'SBA501404-THF010', fci: 'F26154200726', dateRelance: '2026-10-30' });
  regles.creer({ type: 'AIR', gcblo: 'SBA501423-THF010', fci: '' });
  regles.creer({ type: 'AIR', gcblo: 'LRO500767-THF010', fci: 'F09075260926', statutDft: 'REFUSE' });
  return { dossiers: store.tous(), aujourdhui: AUJ, regles, recents: [] };
}
const A = (texte, curseur) => { const ctx = contexte(); return { a: analyser(texte, curseur ?? texte.length, ctx), ctx }; };
const P = (texte, curseur) => { const { a, ctx } = A(texte, curseur); return proposer(a, ctx); };

groupe('Découpage et dates', () => {
  test('les guillemets forment un seul mot', () => egal(decouper('note 501404 "attente client"').map(m => m.texte), ['note', '501404', 'attente client']));
  test('dates relatives', () => { egal(lireDate('demain', AUJ), '2026-11-03'); egal(lireDate('+7', AUJ), '2026-11-09'); egal(lireDate('3j', AUJ), '2026-11-05'); });
  test('jour de la semaine = prochaine occurrence', () => { egal(lireDate('lundi', AUJ), '2026-11-09'); egal(lireDate('vendredi', AUJ), '2026-11-06'); });
  test('date JJ/MM, avec ou sans année', () => { egal(lireDate('12/11', AUJ), '2026-11-12'); egal(lireDate('05/01/2027', AUJ), '2027-01-05'); });
  test('date JJ/MM passée depuis longtemps = l\'an prochain', () => egal(lireDate('15/01', AUJ), '2027-01-15'));
  test('date impossible refusée', () => egal(lireDate('31/02', AUJ), null));
});

groupe('Sans commande', () => {
  test('aucune commande : rien n\'est proposé', () => egal(P('p').propositions, []));
  test('verbe inconnu terminé : marqué en erreur', () => egal(A('blabla ').a.mots[0].role, 'erreur'));
  test('rien d\'exécutable', () => egal(A('passe 501404 en refuse').a.commande, null));
});
