/**
 * wiki.test.js — la commande wiki, avec Wikipédia simulé (même format que
 * l'API MediaWiki, formatversion=2). Aucune connexion n'est faite.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerWiki } from '../js/wiki.js';
import { analyser } from '../js/jarvis/analyse.js';
import { apercu } from '../js/jarvis/completion.js';

function fauxWikipedia(pages) {
  const appels = [];
  return { appels, fetch: async url => { appels.push(url); return { ok: true, json: async () => ({ query: { pages } }) }; } };
}
const ctx = { dossiers: [], aujourdhui: '2026-11-02' };

groupe('Wiki — service', () => {
  test('la meilleure page selon le rang de recherche', async () => {
    const w = fauxWikipedia([
      { title: 'Fibre optique monomode', index: 2, extract: 'b' },
      { title: 'Fibre optique', index: 1, description: 'guide d\'onde', extract: 'Une fibre optique est un fil…', fullurl: 'https://fr.wikipedia.org/wiki/Fibre_optique' }
    ]);
    const r = await creerWiki({ fetch: w.fetch }).chercher('fibre optique');
    egal([r.page.titre, r.page.description, r.homonymie, r.autres], ['Fibre optique', 'guide d\'onde', false, ['Fibre optique monomode']]);
    vrai(w.appels[0].startsWith('https://fr.wikipedia.org/w/api.php') && w.appels[0].includes('origin=*') && w.appels[0].includes('gsrsearch=fibre%20optique'));
  });
  test('page d\'homonymie reconnue', async () => {
    const w = fauxWikipedia([{ title: 'DFT', index: 1, pageprops: { disambiguation: '' } }, { title: 'Transformée de Fourier discrète', index: 2 }]);
    const r = await creerWiki({ fetch: w.fetch }).chercher('DFT');
    vrai(r.homonymie); egal(r.autres, ['Transformée de Fourier discrète']);
  });
  test('rien trouvé', async () => egal((await creerWiki({ fetch: fauxWikipedia(undefined).fetch }).chercher('zzzz')).page, null));
  test('une même recherche n\'est faite qu\'une fois (cache)', async () => {
    const w = fauxWikipedia([{ title: 'GPON', index: 1 }]); const wiki = creerWiki({ fetch: w.fetch });
    await wiki.chercher('GPON'); await wiki.chercher('gpon '); egal(w.appels.length, 1);
  });
  test('service injoignable : message clair', async () => {
    let message = '';
    try { await creerWiki({ fetch: async () => { throw new Error('réseau'); } }).chercher('x'); } catch (e) { message = e.message; }
    egal(message, 'Wikipédia injoignable (connexion ?)');
  });
});

groupe('Wiki — commande', () => {
  test('entre guillemets', () => { const a = analyser('wiki "fibre optique"', 20, ctx); vrai(a.complet); egal(a.valeurs.terme, 'fibre optique'); });
  test('sans guillemets, plusieurs mots', () => egal(analyser('wiki fibre optique', 18, ctx).valeurs.terme, 'fibre optique'));
  test('autres noms de la commande', () => vrai(analyser('def GPON', 8, ctx).complet));
  test('terme obligatoire', () => egal(analyser('wiki ', 5, ctx).manquants, ['terme']));
  test('aperçu', () => egal(apercu(analyser('wiki GPON', 9, ctx), ctx), '→ définition de « GPON » (Wikipédia)'));
});
