/**
 * meteo.js — prévisions météo via Open-Meteo (gratuit, sans compte ni clé).
 *
 * C'est le SEUL module qui contacte un service extérieur. Il n'envoie que le
 * nom de la ville cherchée, puis ses coordonnées : aucune donnée de dossier.
 *
 *   chercherVille(nom)  → [{ nom, region, pays, latitude, longitude }]   (France d'abord, puis le monde)
 *   prevision(lieu)     → { actuel, jours: [7 jours], heures: [toutes les heures sur 7 jours] }
 *
 * `fetch` est injecté : les tests lui substituent des réponses simulées.
 */

const URL_VILLES = 'https://geocoding-api.open-meteo.com/v1/search';
const URL_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 10 * 60 * 1000;   // une même prévision est réutilisée 10 minutes

/** Codes météo WMO → symbole et libellé français. */
const CODES = {
  0: ['☀', 'ciel dégagé'], 1: ['☀', 'peu nuageux'], 2: ['◐', 'éclaircies'], 3: ['☁', 'couvert'],
  45: ['≡', 'brouillard'], 48: ['≡', 'brouillard givrant'],
  51: ['☂', 'bruine légère'], 53: ['☂', 'bruine'], 55: ['☂', 'bruine forte'], 56: ['☂', 'bruine verglaçante'], 57: ['☂', 'bruine verglaçante'],
  61: ['☂', 'pluie faible'], 63: ['☂', 'pluie'], 65: ['☂', 'forte pluie'], 66: ['☂', 'pluie verglaçante'], 67: ['☂', 'pluie verglaçante'],
  71: ['❄', 'neige faible'], 73: ['❄', 'neige'], 75: ['❄', 'forte neige'], 77: ['❄', 'grains de neige'],
  80: ['☂', 'averses'], 81: ['☂', 'averses'], 82: ['☂', 'fortes averses'], 85: ['❄', 'averses de neige'], 86: ['❄', 'averses de neige'],
  95: ['↯', 'orage'], 96: ['↯', 'orage avec grêle'], 99: ['↯', 'orage avec grêle']
};
export const temps = code => CODES[code] || ['?', 'inconnu'];

export function creerMeteo({ fetch: recuperer = (...a) => globalThis.fetch(...a), horloge = () => Date.now() } = {}) {
  const cache = new Map();

  async function json(url) {
    let reponse;
    try { reponse = await recuperer(url); } catch { throw new Error('service météo injoignable (connexion ?)'); }
    if (!reponse.ok) throw new Error(`service météo indisponible (erreur ${reponse.status})`);
    return reponse.json();
  }

  return {
    async chercherVille(nom) {
      const base = `${URL_VILLES}?name=${encodeURIComponent(nom)}&count=5&language=fr&format=json`;
      let r = await json(`${base}&countryCode=FR`);
      if (!r.results?.length) r = await json(base);
      return (r.results || []).map(v => ({
        nom: v.name, region: v.admin2 || v.admin1 || '', pays: v.country || '', latitude: v.latitude, longitude: v.longitude
      }));
    },

    async prevision(lieu) {
      const cle = `${lieu.latitude},${lieu.longitude}`;
      const deja = cache.get(cle);
      if (deja && horloge() - deja.quand < CACHE_MS) return deja.donnees;
      const url = `${URL_PREVISIONS}?latitude=${lieu.latitude}&longitude=${lieu.longitude}`
        + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
        + '&hourly=temperature_2m,weather_code,precipitation_probability'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
        + '&timezone=auto&forecast_days=7';
      const r = await json(url);
      const d = r.daily, h = r.hourly, c = r.current;
      const donnees = {
        actuel: { temperature: c.temperature_2m, humidite: c.relative_humidity_2m, code: c.weather_code, vent: c.wind_speed_10m },
        jours: d.time.map((jour, i) => ({
          jour, code: d.weather_code[i], min: d.temperature_2m_min[i], max: d.temperature_2m_max[i],
          pluie: d.precipitation_sum[i], risquePluie: d.precipitation_probability_max[i], vent: d.wind_speed_10m_max[i]
        })),
        heures: h.time.map((t, i) => ({ jour: t.slice(0, 10), heure: Number(t.slice(11, 13)), temperature: h.temperature_2m[i], code: h.weather_code[i], risquePluie: h.precipitation_probability[i] }))
      };
      cache.set(cle, { quand: horloge(), donnees });
      return donnees;
    }
  };
}
