/*
 * Relais et tournée LINE.
 *
 * 1. Relais : un message « fci … » / « set … to mis-a-dispo » venu d'une page LINE est transmis à
 *    l'onglet du registre GCBLO (cherché sur rezenforge.github.io, quelle que soit la casse de /Sogetrel/).
 *    Un onglet du registre ouvert AVANT l'installation n'a pas encore son script : on l'y injecte.
 *    Réponse : { etat: 'maj' | 'deja' | 'inconnu' | 'absent' | 'ancien' }.
 *
 * 2. Tournée (commande « sync » du registre) : pour chaque dossier, un onglet LINE s'ouvre en arrière-plan
 *    sur « Informations » (le FCI), puis passe sur « Documents » (GCB_1, GCB_2), puis se referme.
 *    PARALLELE dossiers à la fois. Le script LINE dit quand il a fini (« tournee-fini ») ; sans nouvelles
 *    au bout de DELAI_MS, on passe au suivant. L'avancement est renvoyé à l'onglet du registre.
 */
const PARALLELE = 2;
const DELAI_MS = 45000;

async function envoyer(onglet, message) {
  try { return await chrome.tabs.sendMessage(onglet.id, message); }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: onglet.id }, files: ['registre.js'] });
      return await chrome.tabs.sendMessage(onglet.id, message);
    } catch { return null; }
  }
}

async function versRegistre(message) {
  const onglets = (await chrome.tabs.query({ url: 'https://rezenforge.github.io/*' })).filter(o => /\/sogetrel\//i.test(o.url || ''));
  let reponse = null;
  for (const o of onglets) {
    const r = await envoyer(o, message);
    if (r?.etat && r.etat !== 'ancien') return r;
    reponse = r || reponse;
  }
  return reponse || { etat: 'absent' };
}

/* ---------------- Tournée ---------------- */
const tournee = { file: [], actifs: new Map(), enCreation: 0, registre: null, total: 0, fait: 0, echecs: 0 };

const versDocuments = url => url.replace(/\/[^/]*$/, '/document');

function progres(encours = '') {
  if (tournee.registre === null) return;
  const fini = !tournee.file.length && !tournee.actifs.size && !tournee.enCreation;
  chrome.tabs.sendMessage(tournee.registre, { type: 'tournee-progres', progres: { total: tournee.total, fait: tournee.fait, echecs: tournee.echecs, encours, fini } }).catch(() => {});
  if (fini) tournee.registre = null;
}

async function suivants() {
  while (tournee.actifs.size < PARALLELE && tournee.file.length) {
    const item = tournee.file.shift();
    // L'onglet est d'abord vide et déjà compté parmi les actifs : la page LINE, quand elle demande
    // « suis-je en tournée ? », est sûre d'être reconnue, et la tournée n'est jamais crue finie trop tôt
    tournee.enCreation++;
    const onglet = await chrome.tabs.create({ url: 'about:blank', active: false });
    tournee.enCreation--;
    const a = { item, etape: 'info', minuteur: null };
    a.minuteur = setTimeout(() => terminer(onglet.id, false), DELAI_MS);
    tournee.actifs.set(onglet.id, a);
    chrome.tabs.update(onglet.id, { url: item.url }).catch(() => terminer(onglet.id, false));
    progres(item.gcblo);
  }
}

function terminer(id, ok) {
  const a = tournee.actifs.get(id);
  if (!a) return;
  clearTimeout(a.minuteur);
  tournee.actifs.delete(id);
  tournee.fait++;
  if (!ok) tournee.echecs++;
  chrome.tabs.remove(id).catch(() => {});
  progres(a.item.gcblo);
  suivants();
}

function etapeFinie(id, ok) {
  const a = tournee.actifs.get(id);
  if (!a) return;
  if (a.etape === 'info' && ok) {
    a.etape = 'docs';
    clearTimeout(a.minuteur);
    a.minuteur = setTimeout(() => terminer(id, false), DELAI_MS);
    chrome.tabs.update(id, { url: versDocuments(a.item.url) }).catch(() => terminer(id, false));
  } else terminer(id, ok);
}

function arreter() {
  for (const [id, a] of tournee.actifs) { clearTimeout(a.minuteur); chrome.tabs.remove(id).catch(() => {}); }
  tournee.actifs.clear();
  tournee.file = [];
  progres();
}

// Une page qui quitte LINE (ex. renvoyée vers la connexion) : échec pour ce dossier
chrome.tabs.onUpdated.addListener((id, changement) => {
  if (tournee.actifs.has(id) && changement.url && changement.url !== 'about:blank' && !/^https:\/\/flashback\.orange\.fr\//.test(changement.url)) terminer(id, false);
});
chrome.tabs.onRemoved.addListener(id => { if (tournee.actifs.has(id)) terminer(id, false); });

chrome.runtime.onMessage.addListener((message, expediteur, repondre) => {
  switch (message?.type) {
    case 'registre-gcblo-fci':
      versRegistre(message).then(repondre);
      return true;
    case 'tournee-lancer':
      arreter();
      tournee.registre = expediteur.tab?.id ?? null;
      tournee.file = (message.items || []).filter(x => /^https:\/\/flashback\.orange\.fr\//.test(x.url));
      tournee.total = tournee.file.length; tournee.fait = 0; tournee.echecs = 0;
      suivants();
      repondre({ ok: true });
      return;
    case 'tournee-stop':
      arreter();
      repondre({ ok: true });
      return;
    case 'tournee-qui':
      repondre({ etape: tournee.actifs.get(expediteur.tab?.id)?.etape || null });
      return;
    case 'tournee-fini':
      etapeFinie(expediteur.tab?.id, !!message.ok);
      repondre({ ok: true });
      return;
  }
});
