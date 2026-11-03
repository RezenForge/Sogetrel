/**
 * invite.test.js — tests du moteur de l'invite (analyse + autocomplétion).
 * Les commandes sont refaites une par une depuis le 03/11/2026.
 * Mêmes conditions que regles.test.js : store en mémoire, lundi 02/11/2026.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { analyser, lireDate, decouper } from '../js/jarvis/analyse.js';
import { proposer, apercu } from '../js/jarvis/completion.js';
import { optionsDossier } from '../js/jarvis/menus.js';

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

groupe('Commandes ls, open, set, delete, cancel, clear, help', () => {
  test('ls avec filtres', () => { const { a } = A('ls air refuse'); vrai(a.complet); egal(a.valeurs.filtres, [{ type: 'AIR' }, { statut: 'REFUSE' }]); });
  test('open un dossier par un morceau du numéro', () => egal(A('open 501404').a.valeurs.cible.gcblo, 'SBA501404-THF010'));
  test('open avec le GCBLO complet (clic)', () => vrai(A('open SBA501404-THF010').a.complet));
  test('set … to …', () => { const { a } = A('set 501404 to refuse'); vrai(a.complet); egal(a.valeurs.valeur, { statut: 'REFUSE' }); });
  test('le mot « to » peut être omis', () => vrai(A('set 501404 refuse').a.complet));
  test('plusieurs dossiers', () => egal(A('set 501404 501423 to mis-a-dispo').a.valeurs.cibles.length, 2));
  test('cancel, undo, clear, help', () => vrai(['cancel', 'undo', 'clear', 'help', 'help set', '? ls'].every(t => A(t).a.complet)));
  test('delete plusieurs dossiers', () => egal(A('delete 501404 501423').a.valeurs.cibles.length, 2));
  test('les anciens verbes français ne sont plus compris', () => egal(['ouvre', 'passe', 'annule', 'aide'].filter(t => A(t + ' ').a.commande), []));
  test('verbe inconnu terminé : marqué en erreur', () => egal(A('blabla ').a.mots[0].role, 'erreur'));
  test('« se » propose set', () => egal(P('se').propositions.map(p => p.libelle), ['set ‹dossiers› to ‹statut|type›']));
  test('« set 501404 t » propose d\'abord « to »', () => egal(P('set 501404 t').propositions[0].libelle, 'to'));
});

groupe('Aperçu', () => {
  test('ls compte les dossiers', () => { const { a, ctx } = A('ls air'); egal(apercu(a, ctx), '→ 2 dossiers'); });
  test('set décrit le changement', () => { const { a, ctx } = A('set 501404 to refuse'); egal(apercu(a, ctx), '→ SBA501404-THF010 : statut → Refusé'); });
  test('incomplet : rappelle la forme', () => { const { a, ctx } = A('set 501404'); egal(apercu(a, ctx), 'set ‹dossiers› to ‹statut|type›'); });
  test('delete annonce la confirmation', () => { const { a, ctx } = A('delete 501404 501423'); egal(apercu(a, ctx), '→ suppression de 2 dossiers (confirmation)'); });
});

groupe('Menu ⋯ : un clic = une commande', () => {
  const d = contexte().dossiers.find(x => x.gcblo === 'LRO500767-THF010');      // refusé
  const options = optionsDossier(d);
  test('ouvrir en premier', () => egal(options[0].commande, 'open LRO500767-THF010'));
  test('pas de « passer en Refusé » pour un dossier déjà refusé', () => egal(options.slice(1, -1).map(o => o.libelle), ['Passer en « À faire »', 'Passer en « En cours de validation »', 'Passer en « Mis à disposition »']));
  test('chaque choix est une commande complète et comprise', () => {
    const ctx = contexte();
    egal(options.filter(o => !analyser(o.commande, o.commande.length, ctx).complet).map(o => o.commande), []);
  });
  test('supprimer en dernier', () => egal(options.at(-1).commande, 'delete LRO500767-THF010'));
  test('le choix vise bien le statut annoncé', () => {
    const ctx = contexte(), o = options.find(x => x.libelle.includes('Mis à disposition'));
    egal(analyser(o.commande, o.commande.length, ctx).valeurs.valeur, { statut: 'MAD' });
  });
});
