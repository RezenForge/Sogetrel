/**
 * coffre.js — garde des fichiers dans le navigateur (IndexedDB), comme le
 * classeur d'attachement de référence. localStorage serait trop petit pour un
 * classeur ; IndexedDB garde les octets tels quels, sur cet appareil seulement.
 *
 *   creerCoffre() → { lire(cle) → Promise<valeur|null>, ecrire(cle, valeur) → Promise }
 *   coffreMemoire() → même chose, en mémoire (tests, ou navigateur qui refuse IndexedDB)
 */
const BASE = 'gcblo.v2', MAGASIN = 'fichiers';

export function coffreMemoire() {
  const m = new Map();
  return { lire: async cle => m.get(cle) ?? null, ecrire: async (cle, valeur) => { m.set(cle, valeur); } };
}

export function creerCoffre() {
  if (!globalThis.indexedDB) return coffreMemoire();
  const ouvrir = () => new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  const operation = (mode, faire) => ouvrir().then(db => new Promise((ok, ko) => {
    const t = db.transaction(MAGASIN, mode);
    const r = faire(t.objectStore(MAGASIN));
    t.oncomplete = () => { db.close(); ok(r.result ?? null); };
    t.onerror = () => { db.close(); ko(t.error); };
  }));
  return {
    lire: cle => operation('readonly', m => m.get(cle)),
    ecrire: (cle, valeur) => operation('readwrite', m => m.put(valeur, cle))
  };
}
