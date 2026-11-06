/*
 * Sur les pages LINE (flashback.orange.fr) : dès que la page d'un dossier affiche un FCI dans ses
 * commentaires (« Num GCBLO : F99496231124 »), on envoie « fci ‹GCBLO› ‹FCI› » au registre GCBLO ouvert.
 * La page étant une application qui se charge petit à petit, on regarde à chaque changement de la page.
 * Onglet « Documents » (…/document) : pour NIO300747-THF010, il faut une pièce jointe dont le nom contient
 * « GCB_1 » ET « NIO300747_DFT », et une autre dont le nom contient « GCB_2 » ET « NIO300747_DFT_AUTORISE »
 * (tirets, espaces, GCB1/GCB-1, AUTORISÉ aussi reconnus) ; alors on demande au registre de passer le GCBLO
 * en « Mis à disposition » (seulement depuis un statut ouvert).
 * Chaque envoi n'est fait qu'une fois par onglet.
 *
 * Commentaire FCI (onglet « Informations », la page qui a le bloc « Commentaire(s) ») : si AUCUN commentaire ne
 * contient de FCI et que le registre en connaît un pour ce GCBLO, on écrit « Num GCBLO : F… » et on clique sur
 * « Valider » (bouton « Ajouter un commentaire » d'abord si le champ est fermé). Une seule fois par GCBLO et par
 * onglet, seulement quand la page est calme (2 s sans changement) ; jamais par-dessus un texte déjà saisi ;
 * jamais si le registre a PLUSIEURS FCI pour ce GCBLO (bulle orange, rien d'écrit).
 * Le commentaire vu sur la page, le registre l'inscrit dans l'historique du dossier.
 */
(() => {
  const envoyes = new Set();

  function lire() {
    const m = location.pathname.match(/\/(\d{6})\/([A-Za-z]{3})\/[^/]+\/([A-Za-z]+\d*)-(\d)(?:\/|$)/);
    const t = !m && (document.querySelector('h2.dossier')?.innerText || '').match(/Dossier\s+([A-Za-z]{3})(\d{6})\s*\/\s*([A-Za-z]+\d*)-(\d)/);
    if (!m && !t) return null;
    const gcblo = (m ? `${m[2]}${m[1]}-${m[3]}${m[4]}` : `${t[1]}${t[2]}-${t[3]}${t[4]}`).toUpperCase();
    const fci = fciDesCommentaires();
    // Documents : les noms de pièces jointes (liens et textes de la zone principale de la page)
    let gcb1 = false, gcb2 = false;
    if (/\/document/i.test(location.pathname)) {
      // Chaque nom de fichier possible, un par un : les lignes du texte de la page, et les attributs
      // où un nom de fichier peut se cacher (lien, titre, téléchargement). Les deux mots doivent être DANS LE MÊME nom.
      const attributs = [...document.querySelectorAll('[href], [title], [download], [aria-label], [data-name], [alt]')]
        .flatMap(e => ['href', 'title', 'download', 'aria-label', 'data-name', 'alt'].map(a => e.getAttribute(a) || ''));
      const noms = [...document.body.innerText.split('\n'), ...attributs].map(t => { try { return decodeURIComponent(t); } catch { return t; } });
      const affaire = gcblo.slice(0, 9);                       // NIO300747
      const sep = '[\\s_-]*';
      const dft = new RegExp(`${affaire}${sep}DFT`, 'i');
      const autorise = new RegExp(`${affaire}${sep}DFT${sep}AUTORIS[EÉ]`, 'i');
      gcb1 = noms.some(n => /GCB\s*[-_]?\s*1(?!\d)/i.test(n) && dft.test(n));
      gcb2 = noms.some(n => /GCB\s*[-_]?\s*2(?!\d)/i.test(n) && autorise.test(n));
    }
    return { gcblo, fci, mad: gcb1 && gcb2 };
  }

  const fciDesCommentaires = () => {
    const texte = [...document.querySelectorAll('[name="comment-text-container"]')].map(e => e.innerText).join('\n');
    return [...new Set((texte.toUpperCase().match(/F\d{11}(?!\d)/g) || []))];
  };

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

  /* ---------- Commentaire FCI sur LINE ---------- */
  const demander = commande => new Promise(resoudre => chrome.runtime.sendMessage({ type: 'registre-gcblo-fci', commande }, rep => resoudre(rep || null)));
  const attendre = (test, max) => new Promise(resoudre => {
    const debut = Date.now();
    const i = setInterval(() => { const v = test(); if (v || Date.now() - debut > max) { clearInterval(i); resoudre(v || null); } }, 200);
  });
  const boutonDuFormulaire = motif => [...document.querySelectorAll('app-add-comment button')].find(b => motif.test(b.textContent || ''));
  const dejaTente = gcblo => { try { return sessionStorage.getItem(`registre-gcblo-commente-${gcblo}`) === '1'; } catch { return false; } };
  const noterTente = gcblo => { try { sessionStorage.setItem(`registre-gcblo-commente-${gcblo}`, '1'); } catch { /* facultatif */ } };
  let commentaire = null;          // la promesse en cours (la tournée l'attend avant de passer aux documents)

  async function commenterFci(gcblo) {
    if (!document.querySelector('app-add-comment') || fciDesCommentaires().length || dejaTente(gcblo)) return;
    const rep = await demander(`ask ${gcblo}`);
    if (rep?.etat !== 'connu' || !rep.fci?.length) return;
    // Plusieurs FCI au registre : on ne sait pas lequel est le bon pour LINE, on n'écrit rien
    if (rep.fci.length > 1) return bulle(`LINE : ${rep.fci.length} FCI au registre (${rep.fci.join(', ')}) · commentaire non écrit`, '#fcaf3e');
    if (fciDesCommentaires().length || dejaTente(gcblo)) return;      // la page a pu changer pendant la question
    noterTente(gcblo);
    const texte = `Num GCBLO : ${rep.fci[0]}`;
    let zone = document.querySelector('app-add-comment textarea');
    if (!zone) {
      const ouvrir = boutonDuFormulaire(/ajouter un commentaire/i);
      if (!ouvrir) return bulle('LINE : bouton « Ajouter un commentaire » introuvable · FCI non écrit', '#fcaf3e');
      ouvrir.click();
      zone = await attendre(() => document.querySelector('app-add-comment textarea'), 5000);
    }
    if (!zone) return bulle('LINE : champ de commentaire introuvable · FCI non écrit', '#fcaf3e');
    if (zone.value.trim()) return bulle('LINE : un commentaire est déjà en cours de saisie · FCI non écrit', '#fcaf3e');
    zone.focus();
    zone.value = texte;
    // L'application LINE (Angular) lit la saisie sur ces évènements
    zone.dispatchEvent(new Event('input', { bubbles: true }));
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    zone.dispatchEvent(new Event('blur'));
    const valider = await attendre(() => { const b = boutonDuFormulaire(/valider/i); return b && !b.disabled ? b : null; }, 3000);
    if (!valider) return bulle('LINE : bouton « Valider » introuvable ou inactif · FCI non écrit', '#fcaf3e');
    valider.click();
    const vu = await attendre(() => rep.fci.every(f => fciDesCommentaires().includes(f)), 10000);
    if (!vu) return bulle(`LINE : « ${texte} » validé mais pas encore affiché · vérifie la page`, '#fcaf3e');
    bulle(`✓ LINE : commentaire ajouté · ${texte}`);
    demander(`line-commentaire ${gcblo} ${rep.fci.join(' ')}`);
  }

  // Après 2 s sans changement de la page (20 s au plus) : les commentaires sont affichés
  function essayerCommentaire() {
    if (commentaire || /\/document/i.test(location.pathname)) return commentaire;
    commentaire = new Promise(resoudre => {
      const debut = Date.now();
      const i = setInterval(() => {
        const calme = Date.now() - derniereMutation > 2000;
        if (!calme && Date.now() - debut < 20000) return;
        clearInterval(i);
        const r = lire();
        if (!r) return resoudre();
        commenterFci(r.gcblo).catch(() => {}).finally(resoudre);
      }, 300);
    });
    return commentaire;
  }

  function verifier() {
    const r = lire();
    if (!r) return;
    if (document.querySelector('app-add-comment')) essayerCommentaire();
    // GCB1 + GCB2 dans les documents → mis à disposition
    if (r.mad) envoyer(`set ${r.gcblo} to mis-a-dispo`, { maj: `✓ registre : ${r.gcblo} mis à disposition (GCB_1 DFT et GCB_2 DFT_AUTORISE présents)`, inconnu: `registre : ${r.gcblo} n'est pas dans le registre` });
    if (!r.fci.length) return;
    const commande = `fci ${r.gcblo} ${r.fci.join(' ')}`;
    // « deja » (FCI déjà connu) : rien à signaler
    envoyer(commande, { maj: `✓ registre mis à jour : ${commande}`, inconnu: `registre : ${r.gcblo} n'est pas dans le registre` });
  }

  let attente = null, derniereMutation = Date.now();
  new MutationObserver(() => { derniereMutation = Date.now(); clearTimeout(attente); attente = setTimeout(verifier, 600); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  verifier();

  // Tournée LINE (commande sync du registre) : cet onglet a été ouvert par l'extension ? Quand la page
  // est chargée et calme (2 s sans changement, 20 s au plus), on lit, puis on prévient l'extension.
  chrome.runtime.sendMessage({ type: 'tournee-qui' }, rep => {
    if (!rep?.etape) return;
    const debut = Date.now();
    const surveiller = setInterval(() => {
      const prete = !!document.querySelector('h2.dossier') && Date.now() - derniereMutation > 2000;
      if (!prete && Date.now() - debut < 20000) return;
      clearInterval(surveiller);
      verifier();
      // Le commentaire FCI éventuel, puis le temps aux messages vers le registre de partir
      Promise.resolve(commentaire).then(() => setTimeout(() => chrome.runtime.sendMessage({ type: 'tournee-fini', ok: !!lire() }), 1500));
    }, 500);
  });
})();
