/**
 * invite.test.js — tests du moteur de l'invite (analyse + autocomplétion).
 * Mêmes conditions que regles.test.js : store en mémoire, lundi 02/11/2026.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { analyser, lireDate, decouper } from '../js/jarvis/analyse.js';
import { proposer, apercu } from '../js/jarvis/completion.js';

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

groupe('Analyse des commandes', () => {
  test('commande complète : passe … en …', () => {
    const { a } = A('passe 501404 en refuse');
    vrai(a.complet); egal(a.valeurs.cibles.map(d => d.gcblo), ['SBA501404-THF010']); egal(a.valeurs.valeur, { statut: 'REFUSE' });
  });
  test('le mot « en » peut être omis', () => vrai(A('passe 501404 refuse').a.complet));
  test('plusieurs dossiers', () => egal(A('passe 501404 501423 en mis-a-dispo').a.valeurs.cibles.length, 2));
  test('passe … en type', () => egal(A('passe 500767 en sogetrel').a.valeurs.valeur, { type: 'SOGETREL' }));
  test('accents et majuscules tolérés', () => egal(A('passe 501404 en Refusé').a.valeurs.valeur, { statut: 'REFUSE' }));
  test('référence ambiguë signalée', () => { const { a } = A('supprime 5014 '); vrai(!a.complet); vrai(a.erreurs[0].includes('2 dossiers')); });
  test('référence inconnue signalée', () => vrai(A('ouvre 999999 ').a.erreurs[0].includes('aucun dossier')));
  test('emplacement manquant', () => egal(A('passe 501404').a.manquants, ['valeur']));
  test('commande inconnue', () => vrai(A('blabla 501404').a.erreurs[0].includes('commande inconnue')));
  test('ajoute : format et doublon vérifiés', () => {
    vrai(A('ajoute SBA202020-THF010 air').a.complet);
    vrai(A('ajoute SBA5014 air ').a.erreurs[0].includes('format'));
    vrai(A('ajoute SBA501404-THF010 air').a.erreurs[0].includes('existe déjà'));
  });
  test('ajoute avec plusieurs FCI', () => egal(A('ajoute SBA202020-THF010 air F11111111111 F22222222222').a.valeurs.fci.length, 2));
  test('note : le texte libre prend la fin de la ligne', () => egal(A('note 501404 attente retour client').a.valeurs.texte, 'attente retour client'));
  test('relance avec date', () => egal(A('relance 501404 lundi').a.valeurs.date, '2026-11-09'));
  test('ls : filtres combinés', () => {
    const { a, ctx } = A('ls air refuse');
    egal(apercu(a, ctx), '→ 1 dossier');
  });
  test('mot en trop', () => vrai(A('stats truc ').a.erreurs[0].includes('mot en trop')));
});

groupe('Autocomplétion', () => {
  test('début de ligne : les verbes', () => vrai(P('pa').propositions[0].inserer === 'passe '));
  test('texte fantôme du verbe', () => egal(P('rel').fantome, 'ance'));
  test('dossier : morceau de référence → GCBLO complets', () => egal(P('ouvre 5014').propositions.map(p => p.libelle), ['SBA501404-THF010', 'SBA501423-THF010']));
  test('dossier : fantôme complète la référence', () => egal(P('ouvre LRO').fantome, '500767-THF010'));
  test('relance : le groupe « retard » puis les dossiers en retard d\'abord', () => egal(P('relance ').propositions.slice(0, 2).map(p => p.libelle), ['retard', 'SBA501404-THF010']));
  test('après un dossier : proposer « en »', () => egal(P('passe 501404 ').propositions[0].inserer, 'en '));
  test('après « en » : statuts puis types', () => {
    const l = P('passe 501404 en ').propositions.map(p => p.libelle);
    egal(l.slice(0, 4), ['a-faire', 'en-validation', 'mis-a-dispo', 'refuse']); vrai(l.includes('sogetrel'));
  });
  test('statut : complétion par préfixe', () => egal(P('passe 501404 en re').propositions.map(p => p.libelle), ['refuse']));
  test('un dossier déjà choisi n\'est plus proposé', () => vrai(!P('passe SBA501404-THF010 5014').propositions.some(p => p.libelle === 'SBA501404-THF010')));
  test('dates proposées avec la date calculée', () => egal(P('relance 501404 dem').propositions[0].detail, 'le 03/11/2026'));
  test('curseur au milieu de la ligne', () => egal(P('passe 5014 en refuse', 10).propositions.length, 2));
  test('remplace exactement le mot sous le curseur', () => egal(P('ouvre LRO').remplace, { debut: 6, fin: 9 }));
});

groupe('Aperçu', () => {
  test('passe : décrit le changement', () => { const { a, ctx } = A('passe 501404 en refuse'); egal(apercu(a, ctx), '→ SBA501404-THF010 : statut → Refusé'); });
  test('supprime : annonce la confirmation', () => { const { a, ctx } = A('supprime 501404 501423'); egal(apercu(a, ctx), '→ suppression de 2 dossiers (confirmation)'); });
  test('incomplet : rappelle la forme', () => { const { a, ctx } = A('passe 501404'); egal(apercu(a, ctx), 'passe ‹dossiers› en ‹statut|type›'); });
});

groupe('Saisie en cours', () => {
  test('« en » omis, statut en cours de frappe : proposé', () => egal(P('passe 501404 re').propositions.map(p => p.libelle), ['refuse']));
  test('« en » omis, type en cours de frappe : proposé', () => egal(P('passe 501404 sog').propositions.map(p => p.libelle), ['sogetrel']));
  test('« e » après un dossier : on attend « en »', () => egal(P('passe 501404 e').propositions[0].libelle, 'en'));
});
groupe('Couleurs', () => {
  test('verbe en cours de frappe : pas marqué en erreur', () => egal(A('rel').a.mots[0].role, 'brut'));
  test('verbe inconnu terminé : marqué en erreur', () => egal(A('blabla ').a.mots[0].role, 'erreur'));
});
