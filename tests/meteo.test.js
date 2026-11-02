/**
 * meteo.test.js — la commande météo, avec un service Open-Meteo simulé
 * (mêmes formats de réponse que l'API réelle). Aucune connexion n'est faite.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerMeteo, temps } from '../js/meteo.js';
import { creerReglages } from '../js/reglages.js';
import { supportMemoire } from '../js/store.js';
import { analyser } from '../js/jarvis/analyse.js';
import { proposer, apercu } from '../js/jarvis/completion.js';

/** Faux service : enregistre les adresses appelées et répond comme Open-Meteo. */
function fauxService({ villeFrance = true } = {}) {
  const appels = [];
  const fetch = async url => {
    appels.push(url);
    if (url.includes('geocoding')) {
      const results = (!url.includes('countryCode') || villeFrance)
        ? [{ name: 'Bordeaux', latitude: 44.84, longitude: -0.58, admin1: 'Nouvelle-Aquitaine', admin2: 'Gironde', country: 'France', country_code: 'FR' }]
        : undefined;
      return { ok: true, json: async () => (results ? { results } : {}) };
    }
    const jours = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const heures = jours.flatMap(j => Array.from({ length: 24 }, (_, h) => `${j}T${String(h).padStart(2, '0')}:00`));
    return { ok: true, json: async () => ({
      current: { temperature_2m: 12.4, relative_humidity_2m: 80, weather_code: 3, wind_speed_10m: 18.2 },
      hourly: { time: heures, temperature_2m: heures.map((_, i) => 8 + (i % 24) / 4), weather_code: heures.map(() => 61), precipitation_probability: heures.map(() => 70) },
      daily: { time: jours, weather_code: jours.map(() => 63), temperature_2m_max: jours.map(() => 14), temperature_2m_min: jours.map(() => 8),
        precipitation_sum: jours.map(() => 2.1), precipitation_probability_max: jours.map(() => 70), wind_speed_10m_max: jours.map(() => 25) }
    }) };
  };
  return { fetch, appels };
}
const ctx = () => ({ dossiers: [], aujourdhui: '2026-11-02', reglages: creerReglages(supportMemoire({ villes: ['bordeaux', 'le taillan medoc'] })) });

groupe('Météo — service', () => {
  test('cherche d\'abord en France, en français', async () => {
    const s = fauxService(); await creerMeteo({ fetch: s.fetch }).chercherVille('Bordeaux');
    vrai(s.appels[0].includes('countryCode=FR') && s.appels[0].includes('language=fr'));
  });
  test('libellés des codes météo', () => { egal(temps(3), ['☁', 'couvert']); egal(temps(95)[1], 'orage'); egal(temps(1234)[1], 'inconnu'); });
});

groupe('Météo — commande', () => {
  test('ville en plusieurs mots + période', () => {
    const a = analyser('meteo le taillan medoc semaine', 30, ctx());
    vrai(a.complet); egal([a.valeurs.ville.join(' '), a.valeurs.periode], ['le taillan medoc', 'semaine']);
  });
  test('période facultative', () => vrai(analyser('meteo bordeaux', 14, ctx()).complet));
  test('ville obligatoire', () => egal(analyser('meteo ', 6, ctx()).manquants, ['ville']));
  test('villes déjà consultées proposées', () => egal(proposer(analyser('meteo ', 6, ctx()), ctx()).propositions.map(p => p.libelle), ['bordeaux', 'le taillan medoc']));
  test('après la ville : les périodes', () => egal(proposer(analyser('meteo bordeaux s', 16, ctx()), ctx()).propositions.map(p => p.libelle), ['semaine']));
  test('aperçu', () => { const c = ctx(); egal(apercu(analyser('meteo bordeaux demain', 21, c), c), '→ météo de bordeaux · demain (service Open-Meteo)'); });
});
