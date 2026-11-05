/*
 * Relais : un message « fci … » venu d'une page LINE est transmis à l'onglet du registre GCBLO
 * (le premier qui répond). Réponse : { etat: 'maj' | 'deja' | 'inconnu' | 'absent' }.
 */
chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  if (message?.type !== 'registre-gcblo-fci') return;
  chrome.tabs.query({ url: 'https://rezenforge.github.io/Sogetrel/*' }).then(async onglets => {
    for (const o of onglets) {
      try {
        const r = await chrome.tabs.sendMessage(o.id, message);
        if (r?.etat) return repondre(r);
      } catch { /* onglet pas prêt */ }
    }
    repondre({ etat: 'absent' });
  });
  return true;   // réponse asynchrone
});
