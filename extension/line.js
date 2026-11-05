/*
 * Sur les pages LINE (flashback.orange.fr) : dès que la page d'un dossier affiche un FCI dans ses
 * commentaires (« Num GCBLO : F99496231124 »), on envoie « fci ‹GCBLO› ‹FCI› » au registre GCBLO ouvert.
 * La page étant une application qui se charge petit à petit, on regarde à chaque changement de la page.
 * Chaque couple GCBLO + FCI n'est envoyé qu'une fois par onglet. On ne fait que lire la page.
 */
(() => {
  const envoyes = new Set();

  function lire() {
    const m = location.pathname.match(/\/(\d{6})\/([A-Za-z]{3})\/[^/]+\/([A-Za-z]+\d*)-(\d)(?:\/|$)/);
    const t = !m && (document.querySelector('h2.dossier')?.innerText || '').match(/Dossier\s+([A-Za-z]{3})(\d{6})\s*\/\s*([A-Za-z]+\d*)-(\d)/);
    if (!m && !t) return null;
    const gcblo = (m ? `${m[2]}${m[1]}-${m[3]}${m[4]}` : `${t[1]}${t[2]}-${t[3]}${t[4]}`).toUpperCase();
    const texte = [...document.querySelectorAll('[name="comment-text-container"]')].map(e => e.innerText).join('\n');
    const fci = [...new Set((texte.toUpperCase().match(/F\d{11}(?!\d)/g) || []))];
    return { gcblo, fci };
  }

  function bulle(texte, couleur = '#8ae234') {
    const d = document.createElement('div');
    d.textContent = texte;
    d.style.cssText = `position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 14px;background:#2e3436;color:${couleur};font:14px/1.4 monospace;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.4)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4500);
  }

  function verifier() {
    const r = lire();
    if (!r || !r.fci.length) return;
    const commande = `fci ${r.gcblo} ${r.fci.join(' ')}`;
    if (envoyes.has(commande)) return;
    envoyes.add(commande);
    chrome.runtime.sendMessage({ type: 'registre-gcblo-fci', commande }, rep => {
      const etat = rep?.etat;
      if (etat === 'maj') bulle(`✓ registre mis à jour : ${commande}`);
      else if (etat === 'inconnu') bulle(`registre : ${r.gcblo} n'est pas dans le registre`, '#fcaf3e');
      else if (etat === 'absent') { envoyes.delete(commande); bulle('registre GCBLO non ouvert dans ce Chrome : FCI non transmis', '#fcaf3e'); }
      else if (etat === 'ancien') { envoyes.delete(commande); bulle('registre GCBLO à recharger : tape refresh dans le registre, puis recharge cette page', '#fcaf3e'); }
      // « deja » : le registre a déjà ce FCI, rien à signaler
    });
  }

  let attente = null;
  new MutationObserver(() => { clearTimeout(attente); attente = setTimeout(verifier, 600); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  verifier();
})();
