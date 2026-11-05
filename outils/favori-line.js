/*
 * Favori « FCI → registre » (bookmarklet), à utiliser sur la page LINE d'un dossier
 * (flashback.orange.fr/line/dossier/travaux/modif/… ou /consult/…).
 * Il lit le GCBLO dans l'adresse de la page, cherche les FCI (F + 11 chiffres) dans les commentaires
 * (« Num GCBLO : F99496231124 ») et copie la commande « fci ‹GCBLO› ‹FCI› » à coller dans le registre.
 * Rien n'est envoyé ailleurs : tout se passe dans la page ouverte.
 * La page outils/favori-line.html le transforme en lien à glisser dans la barre de favoris.
 */
(() => {
  // Le GCBLO : dans l'adresse (…/travaux/consult|modif/301548/NIO/…/THF01-0/…), sinon dans le titre « Dossier NIO301548 / THF01-0 »
  const m = location.pathname.match(/\/(\d{6})\/([A-Za-z]{3})\/[^/]+\/([A-Za-z]+\d*)-(\d)(?:\/|$)/);
  const t = !m && (document.querySelector('h2.dossier')?.innerText || document.body.innerText).match(/Dossier\s+([A-Za-z]{3})(\d{6})\s*\/\s*([A-Za-z]+\d*)-(\d)/);
  if (!m && !t) { alert('Registre GCBLO : ouvre d\'abord la page LINE d\'un dossier.'); return; }
  const gcblo = (m ? `${m[2]}${m[1]}-${m[3]}${m[4]}` : `${t[1]}${t[2]}-${t[3]}${t[4]}`).toUpperCase();
  const blocs = [...document.querySelectorAll('[name="comment-text-container"]')];
  const texte = blocs.length ? blocs.map(e => e.innerText).join('\n') : document.body.innerText;
  const fci = [...new Set((texte.toUpperCase().match(/F\d{11}(?!\d)/g) || []))];
  if (!fci.length) { alert(`Registre GCBLO : aucun FCI (F + 11 chiffres) dans les commentaires de ${gcblo}.`); return; }
  const commande = `fci ${gcblo} ${fci.join(' ')}`;
  const bulle = () => {
    const d = document.createElement('div');
    d.textContent = `✓ copié : ${commande} — Ctrl+V puis Entrée dans le registre`;
    d.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;padding:10px 14px;background:#2e3436;color:#8ae234;font:14px/1.4 monospace;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.4)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4500);
  };
  navigator.clipboard.writeText(commande).then(bulle, () => prompt('Copie cette commande pour le registre (Ctrl+C) :', commande));
})();
