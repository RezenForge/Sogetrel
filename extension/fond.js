/*
 * Relais : un message « fci … » venu d'une page LINE est transmis à l'onglet du registre GCBLO.
 * Le registre est cherché sur rezenforge.github.io (quelle que soit la casse de /Sogetrel/).
 * Un onglet du registre ouvert AVANT l'installation de l'extension n'a pas encore son script :
 * on l'y injecte, puis on réessaie.
 * Réponse : { etat: 'maj' | 'deja' | 'inconnu' | 'absent' | 'ancien' }.
 */
async function envoyer(onglet, message) {
  try { return await chrome.tabs.sendMessage(onglet.id, message); }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: onglet.id }, files: ['registre.js'] });
      return await chrome.tabs.sendMessage(onglet.id, message);
    } catch { return null; }
  }
}

chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  if (message?.type !== 'registre-gcblo-fci') return;
  chrome.tabs.query({ url: 'https://rezenforge.github.io/*' }).then(async onglets => {
    const registres = onglets.filter(o => /\/sogetrel\//i.test(o.url || ''));
    let reponse = null;
    for (const o of registres) {
      const r = await envoyer(o, message);
      if (r?.etat && r.etat !== 'ancien') return repondre(r);
      reponse = r || reponse;
    }
    repondre(reponse || { etat: 'absent' });
  });
  return true;   // réponse asynchrone
});
