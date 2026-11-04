/**
 * mails.test.js — R12 : mails d'affectation et de relance, au mot près.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { mailAffectation, mailRelance, lienMailto, boitePour } from '../js/mails.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers } from '../js/dossiers.js';
import { analyser } from '../js/jarvis/analyse.js';
import { creerActions } from '../js/jarvis/actions.js';

const NUM21 = ['oelmahdaoui@numerus21.fr', 'azaamoun@numerus21.fr', 'lsettar@numerus21.fr'];
const AIR = ['jeremie-sannier@air-reseaux.com'];
const CC = ['Romain.BOUTINEAU@sogetrel.fr'];
const lignes = m => m.corps.split('\r\n');

groupe('R12 — Destinataires', () => {
  test('boîte BL selon le début du GCBLO', () => egal(['SBA', 'LRO', 'POI', 'ANG', 'NIO', 'MED', 'BOR', 'EST', 'LIB', 'ARC', 'XYZ'].map(p => boitePour(`${p}501404-THF010`)?.adresse || null),
    [...Array(5).fill('info_lpc_BL@sogetrel.fr'), ...Array(5).fill('info_aquitaine_BL@sogetrel.fr'), null]));
  test('NUM21 + LPC, copie Romain Boutineau', () => { const m = mailAffectation('SBA501404-THF010', 'NUM21'); egal([m.a, m.cc], [[...NUM21, 'info_lpc_BL@sogetrel.fr'], CC]); });
  test('AIR + Aquitaine', () => egal(mailAffectation('BOR501404-THF010', 'AIR').a, [...AIR, 'info_aquitaine_BL@sogetrel.fr']));
  test('préfixe inconnu : pas de boîte BL, signalé', () => { const m = mailAffectation('XYZ501404-THF010', 'NUM21'); egal(m.a, NUM21); egal(m.avertissements.length, 1); });
  test('pas de mail pour Sogetrel', () => { let e = ''; try { mailAffectation('SBA501404-THF010', 'SOGETREL'); } catch (x) { e = x.message; } vrai(e.includes('Sogetrel') || e.includes('SOGETREL')); });
});

groupe('R12 — Mail d\'affectation', () => {
  test('NUM21', () => {
    const m = mailAffectation('SBA501404-THF010', 'NUM21');
    egal(m.objet, 'Affectation GCBLO NUM21 | SBA501404-THF010');
    egal(lignes(m), ['Bonjour,', '', '@info_lpc_BL : Merci d’affecter la ligne SBA501404-THF010 à NUM21.', '', '@NUM21 : Pouvez-vous nous fournir le numéro de commande.', '', 'Merci d’avance.']);
  });
  test('AIR (Aquitaine)', () => {
    const m = mailAffectation('MED501404-THF010', 'AIR');
    egal(m.objet, 'Affectation GCBLO AIR | MED501404-THF010');
    egal(lignes(m), ['Bonjour,', '', '@info_aquitaine_BL : Merci d’affecter la ligne MED501404-THF010 à AIR.', '', '@Jérémie SANNIER : Peux-tu nous fournir le numéro de commande.', '', 'Merci d’avance.']);
  });
});

groupe('R12 — Mails de relance', () => {
  test('FCI NUM21', () => {
    const m = mailRelance('SBA501404-THF010', 'NUM21', 'fci');
    egal(m.objet, 'Relance GCBLO NUM21 | SBA501404-THF010');
    egal(lignes(m), ['Bonjour,', '', 'Je me permets de vous relancer.', 'Nous avons besoin du numéro de commande, pouvez-vous nous le fournir ?', '', 'Merci d’avance.']);
  });
  test('FCI AIR', () => egal(lignes(mailRelance('SBA501404-THF010', 'AIR', 'fci')), ['Bonjour Jérémie,', '', 'Je me permets de te relancer.', 'Nous avons besoin du numéro de commande, peux-tu nous le fournir ?', '', 'Merci d’avance.']));
  test('DFT NUM21', () => {
    const m = mailRelance('SBA501404-THF010', 'NUM21', 'dft');
    egal(m.objet, 'Relance GCBLO DFT NUM21 | SBA501404-THF010');
    egal(lignes(m), ['Bonjour,', '', 'Pouvez-vous réaliser le DFT du dossier en objet et mettre à disposition les docs GCB1 et GCB2 sur le LINE ?', '', 'Merci d’avance.']);
  });
  test('DFT AIR', () => {
    const m = mailRelance('SBA501404-THF010', 'AIR', 'dft');
    egal([m.objet, lignes(m)[0], lignes(m)[2]], ['Relance GCBLO DFT AIR | SBA501404-THF010', 'Bonjour Jérémie,', 'Peux-tu réaliser le DFT du dossier en objet et mettre à disposition les docs GCB1 et GCB2 sur le LINE ?']);
  });
  test('lien mailto : destinataires « ; », copie, objet et texte encodés', () => {
    const l = lienMailto(mailRelance('SBA501404-THF010', 'AIR', 'fci'));
    vrai(l.startsWith('mailto:jeremie-sannier%40air-reseaux.com;info_lpc_BL%40sogetrel.fr?cc=Romain.BOUTINEAU%40sogetrel.fr&subject=Relance%20GCBLO%20AIR%20%7C%20SBA501404-THF010&body=Bonjour%20J%C3%A9r%C3%A9mie%2C%0D%0A'));
  });
});

groupe('R12 — Commandes affect et relance', () => {
  const env = () => {
    const store = creerStore(supportMemoire());
    const regles = creerDossiers(store, { horloge: () => new Date(2026, 10, 4, 9) });
    const ouverts = [], sortie = [];
    const actions = creerActions({ regles, store, ecran: { ligne: h => sortie.push(h), tableau() {}, fiche() {}, vider() {} }, confirmer: async () => true, demander: async () => null, ouvrirMail: l => ouverts.push(l) });
    const lancer = t => { const a = analyser(t, t.length, { dossiers: store.tous(), aujourdhui: '2026-11-04', regles }); vrai(a.complet, `incomplet : ${t} ${a.erreurs}`); return actions.executer(a); };
    return { store, regles, ouverts, sortie, lancer };
  };
  test('affect sur un GCBLO absent : créé, mail ouvert, cancel le retire', async () => {
    const e = env();
    await e.lancer('affect SBA501404-THF010 num21');
    egal([e.store.parGcblo('SBA501404-THF010').type, e.ouverts.length], ['NUM21', 1]);
    vrai(e.ouverts[0].includes('Affectation%20GCBLO%20NUM21'));
    egal(e.store.parGcblo('SBA501404-THF010').historique.at(-1).detail, 'Mail d’affectation préparé');
    await e.lancer('cancel'); egal(e.store.tous().length, 0);
  });
  test('affect sur un dossier sans affect (import) : affect et date d\'affectation du jour', async () => {
    const e = env();
    e.regles.creer({ gcblo: 'BOR501404-THF010', dateAffectation: '2026-10-01' });
    await e.lancer('affect BOR501404-THF010 air');
    const d = e.store.parGcblo('BOR501404-THF010');
    egal([d.type, d.dateAffectation], ['AIR', '2026-11-04']); vrai(e.ouverts[0].includes('aquitaine'));
  });
  test('affect sogetrel : pas de mail', async () => { const e = env(); await e.lancer('affect SBA501404-THF010 sogetrel'); egal([e.store.tous()[0].type, e.ouverts.length], ['SOGETREL', 0]); });
  test('relance fci : seulement si aucun FCI', async () => {
    const e = env();
    e.regles.creer({ gcblo: 'SBA501404-THF010', type: 'NUM21' });
    e.regles.creer({ gcblo: 'SBA501405-THF010', type: 'NUM21', fci: 'F26154200726' });
    await e.lancer('relance SBA501404-THF010 fci'); await e.lancer('relance SBA501405-THF010 fci');
    egal(e.ouverts.length, 1); vrai(e.sortie.at(-1).includes('a déjà un FCI'));
  });
  test('relance dft, et refus sans affect', async () => {
    const e = env();
    e.regles.creer({ gcblo: 'SBA501404-THF010', type: 'AIR' }); e.regles.creer({ gcblo: 'SBA501406-THF010' });
    await e.lancer('relance 501404 dft'); await e.lancer('relance 501406 dft');
    egal(e.ouverts.length, 1); vrai(e.ouverts[0].includes('DFT')); vrai(e.sortie.at(-1).includes('sans affect'));
  });
});
