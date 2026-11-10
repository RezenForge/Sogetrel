/**
 * affects-ajoutes.js — R23 : affects ajoutés avec « add ‹AFFECT› ».
 *
 * La liste de base (NUM21, AIR, Sogetrel) est dans config.js. Les affects ajoutés sont gardés dans le navigateur
 * (gcblo.v2.affectsAjoutes) et relus au chargement de la page : config.js les met à la suite de TYPES,
 * grammaire.js dans MOTS_TYPE. Ils servent seulement d'étiquettes (affecter, filtrer, trier, tableau de bord) :
 * aucun mail, aucune règle d'import du classeur, rien d'autre ne change.
 *
 *   lireAffectsAjoutes()                  → [{ code, libelle, mot }]
 *   nouvelAffect(nom, motsPris, codesPris) → { ok, affect } ou { ok: false, erreur }
 *   ajouterAffect(affect)                 → enregistre (true si c'est fait)
 */
export const CLE_AFFECTS_AJOUTES = 'gcblo.v2.affectsAjoutes';

export function lireAffectsAjoutes() {
  try {
    const l = JSON.parse(localStorage.getItem(CLE_AFFECTS_AJOUTES) || '[]');
    return Array.isArray(l) ? l.filter(a => a && /^[A-Z][A-Z0-9_]{1,19}$/.test(a.code) && a.libelle && a.mot) : [];
  } catch { return []; }
}

/** Le mot tapé dans l'invite : sans accents, minuscules (comme plat() de la grammaire). */
const motDe = nom => String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function nouvelAffect(nom, motsPris = [], codesPris = []) {
  const libelle = String(nom ?? '').trim();
  if (!libelle) return { ok: false, erreur: 'nom d’affect manquant : add ‹AFFECT›' };
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]{1,19}$/.test(libelle)) return { ok: false, erreur: `« ${libelle} » : un seul mot de 2 à 20 caractères (lettres, chiffres, - ou _), commençant par une lettre` };
  const mot = motDe(libelle);
  const code = mot.toUpperCase().replace(/-/g, '_');
  if (codesPris.includes(code)) return { ok: false, erreur: `l’affect ${libelle} existe déjà` };
  if (motsPris.includes(mot)) return { ok: false, erreur: `« ${mot} » est déjà un mot du registre (statut, filtre, commande…) : choisir un autre nom` };
  return { ok: true, affect: { code, libelle, mot } };
}

export function ajouterAffect(affect) {
  try {
    localStorage.setItem(CLE_AFFECTS_AJOUTES, JSON.stringify([...lireAffectsAjoutes(), affect]));
    return true;
  } catch { return false; }
}
