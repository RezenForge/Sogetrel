/*
 * LINE · vider le cache — un clic sur le bouton de l'extension (barre d'outils de Chrome) :
 *  1. retient l'adresse de l'onglet LINE ouvert (s'il y en a un) et ferme tous les onglets flashback.orange.fr
 *     (leur mémoire d'onglet part avec eux) ;
 *  2. efface les données de flashback.orange.fr ET de la connexion Orange (dro.orange-business.com) : cache,
 *     stockage (local, IndexedDB, service workers) et cookies — Chrome efface les cookies des domaines entiers
 *     orange.fr et orange-business.com : on repart d'une connexion propre (sinon la connexion d'Orange garde
 *     une session à moitié effacée et répond « Not Acceptable ») ;
 *  3. rouvre l'ACCUEIL de Flashback (pas la page du dossier : la connexion doit repartir du début).
 * Rien d'autre n'est touché (ni le registre, ni les autres sites). Le badge affiche OK, ou ERR si Chrome refuse
 * (règle de l'organisation) : le détail est dans l'info-bulle du bouton.
 */
const ORIGINES = ['https://flashback.orange.fr', 'https://dro.orange-business.com'];
const ACCUEIL = 'https://flashback.orange.fr/';

async function nettoyer() {
  const onglets = await chrome.tabs.query({ url: ['https://flashback.orange.fr/*', 'https://*.orange-business.com/*'] });
  if (onglets.length) await chrome.tabs.remove(onglets.map(o => o.id));
  await chrome.browsingData.remove({ origins: ORIGINES }, {
    cache: true, cacheStorage: true, cookies: true, indexedDB: true, localStorage: true, serviceWorkers: true, fileSystems: true
  });
  await chrome.tabs.create({ url: ACCUEIL, active: true });
}

chrome.action.onClicked.addListener(async () => {
  chrome.action.setBadgeText({ text: '…' });
  try {
    await nettoyer();
    chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    chrome.action.setBadgeText({ text: 'OK' });
    chrome.action.setTitle({ title: `LINE · cache vidé à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` });
  } catch (e) {
    chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setTitle({ title: `LINE · échec : ${e.message}` });
  }
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);
});
