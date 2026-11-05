/*
 * Dans l'onglet du registre : passe la commande reçue de LINE à la page du registre (js/main.js),
 * qui la vérifie et l'exécute, puis renvoie l'état (maj, deja, inconnu).
 */
chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  if (message?.type !== 'registre-gcblo-fci') return;
  const id = Math.random().toString(36).slice(2);
  const ecoute = e => {
    if (e.source !== window || e.data?.registreGcbloEtat === undefined || e.data.id !== id) return;
    removeEventListener('message', ecoute);
    repondre({ etat: e.data.registreGcbloEtat });
  };
  addEventListener('message', ecoute);
  window.postMessage({ registreGcbloExtension: message.commande, id }, location.origin);
  setTimeout(() => { removeEventListener('message', ecoute); }, 3000);
  return true;
});
