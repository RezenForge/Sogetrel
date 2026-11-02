/**
 * wiki.js — définition d'un mot ou d'une expression, d'après Wikipédia en français.
 *
 * Comme meteo.js, ce module contacte un service extérieur : il n'envoie que le
 * terme cherché, jamais une donnée de dossier.
 *
 * Une seule requête à l'API MediaWiki : recherche du terme + résumé (début de
 * l'article en texte simple) des 5 meilleures pages.
 *
 *   chercher(terme) → { page: { titre, description, extrait, url } | null,
 *                       homonymie: bool,       la meilleure page est une page d'homonymie
 *                       autres: [titres] }     les autres pages trouvées
 *
 * `fetch` est injecté : les tests lui substituent des réponses simulées.
 */

const API = 'https://fr.wikipedia.org/w/api.php';
const CACHE_MS = 30 * 60 * 1000;

export function creerWiki({ fetch: recuperer = (...a) => globalThis.fetch(...a), horloge = () => Date.now() } = {}) {
  const cache = new Map();

  return {
    async chercher(terme) {
      const cle = terme.trim().toLowerCase();
      const deja = cache.get(cle);
      if (deja && horloge() - deja.quand < CACHE_MS) return deja.resultat;

      const url = `${API}?action=query&format=json&formatversion=2&origin=*&redirects=1`
        + '&generator=search&gsrlimit=5&gsrsearch=' + encodeURIComponent(terme)
        + '&prop=extracts|description|info|pageprops&ppprop=disambiguation&inprop=url'
        + '&exintro=1&explaintext=1&exsentences=4';
      let reponse;
      try { reponse = await recuperer(url); } catch { throw new Error('Wikipédia injoignable (connexion ?)'); }
      if (!reponse.ok) throw new Error(`Wikipédia indisponible (erreur ${reponse.status})`);
      const donnees = await reponse.json();

      // Les pages arrivent dans le désordre : « index » donne leur rang dans la recherche
      const pages = (donnees.query?.pages || []).slice().sort((a, b) => a.index - b.index);
      const meilleure = pages[0];
      const resultat = {
        page: meilleure ? {
          titre: meilleure.title,
          description: meilleure.description || '',
          extrait: (meilleure.extract || '').trim(),
          url: meilleure.fullurl || `https://fr.wikipedia.org/wiki/${encodeURIComponent(meilleure.title.replace(/ /g, '_'))}`
        } : null,
        homonymie: !!meilleure?.pageprops && 'disambiguation' in meilleure.pageprops,
        autres: pages.slice(1).map(p => p.title)
      };
      cache.set(cle, { quand: horloge(), resultat });
      return resultat;
    }
  };
}
