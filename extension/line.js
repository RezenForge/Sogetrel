/*
 * Sur les pages LINE (flashback.orange.fr) : dès que la page d'un dossier affiche un FCI dans ses
 * commentaires (« Num GCBLO : F99496231124 »), on envoie « fci ‹GCBLO› ‹FCI› » au registre GCBLO ouvert.
 * La page étant une application qui se charge petit à petit, on regarde à chaque changement de la page.
 * Onglet « Documents » (…/document) : si une pièce jointe contient « GCB_1 » et une autre « GCB_2 » (GCB1, GCB-1… aussi reconnus),
 * on demande au registre de passer le GCBLO en « Mis à disposition » (seulement depuis un statut ouvert).
 * Chaque envoi n'est fait qu'une fois par onglet. On ne fait que lire la page.
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
    // Documents : les noms de pièces jointes (liens et textes de la zone principale de la page)
    let gcb1 = false, gcb2 = false;
    if (/\/document(?:s)?(?:\/|$)/i.test(location.pathname)) {
      const zone = document.querySelector('main, app-root') || document.body;
      const noms = [...zone.querySelectorAll('a, td, li, span, div')].filter(e => !e.children.length).map(e => e.textContent).join('\n');
      gcb1 = /GCB\s*[-_]?\s*1(?!\d)/i.test(noms);
      gcb2 = /GCB\s*[-_]?\s*2(?!\d)/i.test(noms);
    }
    return { gcblo, fci, mad: gcb1 && gcb2 };
  }

  function bulle(texte, couleur = '#8ae234') {
    const d = document.createElement('div');
    d.textContent = texte;
    // Plusieurs bulles à la fois : empilées
    const deja = document.querySelectorAll('[data-registre-gcblo-bulle]').length;
    d.dataset.registreGcbloBulle = '1';
    d.style.cssText = `position:fixed;z-index:2147483647;top:${16 + deja * 52}px;right:16px;padding:10px 14px;background:#2e3436;color:${couleur};font:14px/1.4 monospace;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.4)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4500);
  }

  function envoyer(commande, textes) {
    if (envoyes.has(commande)) return;
    envoyes.add(commande);
    chrome.runtime.sendMessage({ type: 'registre-gcblo-fci', commande }, rep => {
      const etat = rep?.etat;
      if (etat === 'maj') bulle(textes.maj);
      else if (etat === 'inconnu') bulle(textes.inconnu, '#fcaf3e');
      else if (etat === 'absent') { envoyes.delete(commande); bulle('registre GCBLO non ouvert dans ce Chrome : rien transmis', '#fcaf3e'); }
      else if (etat === 'ancien') { envoyes.delete(commande); bulle('registre GCBLO à recharger : tape refresh dans le registre, puis recharge cette page', '#fcaf3e'); }
    });
  }

  function verifier() {
    const r = lire();
    if (!r) return;
    // GCB1 + GCB2 dans les documents → mis à disposition
    if (r.mad) envoyer(`set ${r.gcblo} to mis-a-dispo`, { maj: `✓ registre : ${r.gcblo} mis à disposition (GCB_1 et GCB_2 présents)`, inconnu: `registre : ${r.gcblo} n'est pas dans le registre` });
    if (!r.fci.length) return;
    const commande = `fci ${r.gcblo} ${r.fci.join(' ')}`;
    // « deja » (FCI déjà connu) : rien à signaler
    envoyer(commande, { maj: `✓ registre mis à jour : ${commande}`, inconnu: `registre : ${r.gcblo} n'est pas dans le registre` });
  }

  let attente = null;
  new MutationObserver(() => { clearTimeout(attente); attente = setTimeout(verifier, 600); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  verifier();
})();
