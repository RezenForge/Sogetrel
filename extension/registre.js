/*
 * Dans l'onglet du registre :
 *  - passe à la page du registre (js/main.js) les commandes venues de LINE, et renvoie l'état (maj, deja, inconnu) ;
 *    pas de réponse en 1,5 s : version du registre trop ancienne → « ancien » (faire refresh) ;
 *  - transmet à l'extension la tournée demandée par « sync » (et « sync stop »), puis l'avancement à la page.
 */
if (!window.__registreGcbloExtension) {
  window.__registreGcbloExtension = true;

  chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
    if (message?.type === 'tournee-progres') { window.postMessage({ registreGcbloTourneeProgres: message.progres }, location.origin); return; }
    if (message?.type !== 'registre-gcblo-fci') return;
    const id = Math.random().toString(36).slice(2);
    let fini = false;
    const ecoute = e => {
      if (e.source !== window || e.data?.registreGcbloEtat === undefined || e.data.id !== id) return;
      fini = true;
      removeEventListener('message', ecoute);
      repondre({ etat: e.data.registreGcbloEtat, fci: e.data.fci });
    };
    addEventListener('message', ecoute);
    window.postMessage({ registreGcbloExtension: message.commande, id }, location.origin);
    setTimeout(() => { if (!fini) { removeEventListener('message', ecoute); repondre({ etat: 'ancien' }); } }, 1500);
    return true;
  });

  addEventListener('message', e => {
    if (e.source !== window) return;
    if (Array.isArray(e.data?.registreGcbloTournee)) {
      const id = e.data.id;
      chrome.runtime.sendMessage({ type: 'tournee-lancer', items: e.data.registreGcbloTournee }, () => {
        window.postMessage({ registreGcbloTourneeAck: id }, location.origin);
      });
    } else if (e.data?.registreGcbloTourneeStop) chrome.runtime.sendMessage({ type: 'tournee-stop' });
  });
}
