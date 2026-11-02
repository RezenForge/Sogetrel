/**
 * dates.js — calculs sur des dates « jour ».
 *
 * Les dates métier (affectation, relance) n'ont pas d'heure. On les stocke
 * en texte « AAAA-MM-JJ », calculé en heure locale. Ainsi une relance prévue
 * le 05/11 reste le 05/11, quel que soit le fuseau ou l'heure de la journée.
 * Les horodatages (création, historique) sont, eux, des dates ISO complètes.
 *
 * Fonctions pures : aucune ne lit l'horloge elle-même. On leur passe
 * « maintenant », ce qui permet de les tester avec une date fixe.
 */

const deuxChiffres = n => String(n).padStart(2, '0');

/** Date JavaScript → « AAAA-MM-JJ » (heure locale). */
export function versJour(date) {
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}`;
}

/** Vrai si le texte est une date « AAAA-MM-JJ » qui existe vraiment (refuse le 31/02). */
export function estJour(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  return versJour(depuisJour(texte)) === texte;
}

/** « AAAA-MM-JJ » → Date JavaScript à minuit, heure locale. */
export function depuisJour(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j);
}

/** Le jour d'aujourd'hui, à partir de l'instant donné. */
export function aujourdhui(maintenant) {
  return versJour(maintenant);
}

/** Ajoute (ou retire) des jours à une date « jour ». */
export function ajouterJours(jour, n) {
  const d = depuisJour(jour);
  d.setDate(d.getDate() + n);
  return versJour(d);
}

/**
 * Nombre de jours de `reference` à `jour`.
 * Positif : dans le futur ; négatif : dans le passé ; 0 : le même jour.
 * L'arrondi absorbe les changements d'heure été/hiver.
 */
export function ecartJours(jour, reference) {
  return Math.round((depuisJour(jour) - depuisJour(reference)) / 86400000);
}

/** « AAAA-MM-JJ » → « JJ/MM/AAAA » pour l'affichage. */
export function formater(jour) {
  if (!estJour(jour)) return '';
  const [a, m, j] = jour.split('-');
  return `${j}/${m}/${a}`;
}
