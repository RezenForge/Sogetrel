/**
 * xlsx.js — lit un classeur Excel (.xlsx, .xlsm) dans le navigateur, sans bibliothèque.
 *
 * Un classeur Excel moderne est une archive ZIP de fichiers XML :
 *   xl/workbook.xml              la liste des onglets
 *   xl/_rels/workbook.xml.rels   quel fichier correspond à quel onglet
 *   xl/sharedStrings.xml         les textes, rangés une seule fois et appelés par numéro
 *   xl/worksheets/sheetN.xml     les cellules d'un onglet
 * On ouvre l'archive (DecompressionStream, intégré aux navigateurs), puis on lit ces XML (DOMParser).
 * Les anciens fichiers .xls (format binaire d'avant 2007) ne sont pas pris en charge.
 *
 *   lireClasseur(octets, { onglets? }) → Promise<{
 *     onglets: ['33', '16', …],                       tous les onglets du classeur, dans l'ordre
 *     feuilles: { '33': [{ numero: 5, cellules: { D: 'SBA…', E: 'GCBLO', J: '…' } }, …] }
 *   }>
 * Seuls les onglets demandés sont lus (tous si `onglets` n'est pas donné).
 * Les valeurs sont du texte, sauf les nombres (number) et les booléens (true/false).
 *
 *   modifierClasseur(octets, { cellules: { X5: 'Mérignac', AB30: 1, AG5: { date: '2026-11-03' } } })
 *     → Promise<Uint8Array>  une copie du classeur avec ces cellules remplies (première feuille).
 * Tout le reste (mise en forme, formules, macros) est recopié tel quel ; Excel recalcule à l'ouverture.
 */

/* ---------------- Archive ZIP ---------------- */

/** Liste les fichiers de l'archive : nom → { methode, taille, debut } (sans les décompresser). */
function lireZip(octets) {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  // La fin de l'archive (signature PK\5\6) donne l'emplacement du répertoire central
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('ce fichier n\'est pas un classeur Excel (.xlsx ou .xlsm)');
  const nombre = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const fichiers = new Map();
  const texte = new TextDecoder();
  for (let k = 0; k < nombre; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('classeur abîmé (répertoire ZIP illisible)');
    const drapeaux = v.getUint16(p + 8, true), methode = v.getUint16(p + 10, true);
    const heure = v.getUint16(p + 12, true), date = v.getUint16(p + 14, true);
    const crc = v.getUint32(p + 16, true), taille = v.getUint32(p + 20, true), tailleBrute = v.getUint32(p + 24, true);
    const lnNom = v.getUint16(p + 28, true), lnExtra = v.getUint16(p + 30, true), lnComm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = texte.decode(octets.subarray(p + 46, p + 46 + lnNom));
    // L'en-tête local a sa propre longueur de nom et de champ extra
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    fichiers.set(nom, { methode, taille, tailleBrute, debut, crc, heure, date, drapeaux });
    p += 46 + lnNom + lnExtra + lnComm;
  }
  return fichiers;
}

async function extraire(octets, entree) {
  const brut = octets.subarray(entree.debut, entree.debut + entree.taille);
  if (entree.methode === 0) return new TextDecoder().decode(brut);
  if (entree.methode !== 8) throw new Error('compression non prise en charge dans ce classeur');
  const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flux).text();
}

/* ---------------- XML Excel ---------------- */

const xml = texte => new DOMParser().parseFromString(texte, 'application/xml');
const enfants = (el, nom) => [...el.getElementsByTagNameNS('*', nom)];

/** « D12 » → « D ». */
const colonne = ref => ref.replace(/\d+$/, '');

/** Chemin d'un fichier cité par workbook.xml.rels (relatif à xl/, ou absolu). */
const chemin = cible => (cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`).replace(/\/\.\//g, '/');

function lireTextes(doc) {
  // Un texte peut être en plusieurs morceaux mis en forme (<r><t>…</t></r>) : on les recolle
  return enfants(doc, 'si').map(si => enfants(si, 't').map(t => t.textContent).join(''));
}

function lireFeuille(doc, textes) {
  return enfants(doc, 'row').map(row => {
    const cellules = {};
    for (const c of enfants(row, 'c')) {
      const type = c.getAttribute('t'), vEl = enfants(c, 'v')[0];
      let valeur;
      if (type === 's') valeur = textes[Number(vEl?.textContent)] ?? '';
      else if (type === 'inlineStr') valeur = enfants(c, 't').map(t => t.textContent).join('');
      else if (type === 'b') valeur = vEl?.textContent === '1';
      else if (type === 'str' || type === 'e') valeur = vEl?.textContent ?? '';
      else valeur = vEl ? Number(vEl.textContent) : '';
      if (valeur !== '') cellules[colonne(c.getAttribute('r') || '')] = valeur;
    }
    return { numero: Number(row.getAttribute('r')), cellules };
  });
}

export async function lireClasseur(donnees, { onglets: voulus } = {}) {
  const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees);
  const fichiers = lireZip(octets);
  const lire = async nom => { const e = fichiers.get(nom); return e ? extraire(octets, e) : null; };

  const classeur = await lire('xl/workbook.xml');
  if (!classeur) throw new Error('ce fichier n\'est pas un classeur Excel (.xlsx ou .xlsm)');
  const liens = new Map(enfants(xml(await lire('xl/_rels/workbook.xml.rels') || '<r/>'), 'Relationship')
    .map(r => [r.getAttribute('Id'), chemin(r.getAttribute('Target'))]));
  const onglets = enfants(xml(classeur), 'sheet').map(s => ({
    nom: s.getAttribute('name'),
    fichier: liens.get(s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
  }));

  const partages = await lire('xl/sharedStrings.xml');
  const textes = partages ? lireTextes(xml(partages)) : [];
  const feuilles = {};
  for (const o of onglets) {
    const nom = o.nom.trim();                 // « 33 » et « 33 » suivi d'un espace : même onglet
    if (voulus && !voulus.includes(nom)) continue;
    const contenu = o.fichier && await lire(o.fichier);
    if (contenu) feuilles[nom] = lireFeuille(xml(contenu), textes);
  }
  return { onglets: onglets.map(o => o.nom), feuilles };
}

/** Vrai si le classeur contient des macros (il doit alors s'enregistrer en .xlsm). */
export const contientMacros = donnees => lireZip(donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees)).has('xl/vbaProject.bin');

/* ---------------- Écriture : copie modifiée d'un classeur ---------------- */

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function compresser(octets) {
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/** Assemble une archive ZIP à partir d'entrées { nom, donnees (compressées), methode, crc, taille, tailleBrute, heure, date }. */
function ecrireZip(entrees) {
  const enc = new TextEncoder();
  const morceaux = [], central = [];
  let position = 0;
  for (const e of entrees) {
    const nom = enc.encode(e.nom);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, e.methode, true); local.setUint16(10, e.heure, true); local.setUint16(12, e.date, true);
    local.setUint32(14, e.crc, true); local.setUint32(18, e.donnees.length, true); local.setUint32(22, e.tailleBrute, true);
    local.setUint16(26, nom.length, true); local.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, e.methode, true); c.setUint16(12, e.heure, true); c.setUint16(14, e.date, true);
    c.setUint32(16, e.crc, true); c.setUint32(20, e.donnees.length, true); c.setUint32(24, e.tailleBrute, true);
    c.setUint16(28, nom.length, true); c.setUint32(42, position, true);
    morceaux.push(new Uint8Array(local.buffer), nom, e.donnees);
    central.push(new Uint8Array(c.buffer), nom);
    position += 30 + nom.length + e.donnees.length;
  }
  const tailleCentral = central.reduce((n, m) => n + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entrees.length, true); fin.setUint16(10, entrees.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, position, true);
  const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
  const sortie = new Uint8Array(tout.reduce((n, m) => n + m.length, 0));
  let i = 0;
  for (const m of tout) { sortie.set(m, i); i += m.length; }
  return sortie;
}

/** « AB30 » → 28 (A = 1). */
const numeroColonne = lettres => [...lettres].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0);
/** « 2026-11-03 » → numéro de jour Excel (jours depuis le 30/12/1899). */
const jourExcel = jour => { const [a, m, j] = jour.split('-').map(Number); return (Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86400000; };

/** Les styles de cellule (index) dont le format est une date. */
function stylesDate(stylesXml) {
  if (!stylesXml) return new Set();
  const doc = xml(stylesXml);
  const perso = new Map(enfants(doc, 'numFmt').map(f => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || '']));
  const estDate = id => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)
    || (perso.has(id) && /[dmy]/i.test(perso.get(id).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')));
  const xfs = enfants(doc, 'cellXfs')[0];
  const dates = new Set();
  if (xfs) [...xfs.children].forEach((xf, i) => { if (estDate(Number(xf.getAttribute('numFmtId')))) dates.add(i); });
  return dates;
}

/** Écrit une valeur dans une cellule de la feuille (DOM), en créant la ligne et la cellule au bon endroit. */
function ecrireCellule(doc, ref, valeur, dates) {
  const ns = doc.documentElement.namespaceURI;
  const [, lettres, chiffres] = ref.match(/^([A-Z]+)(\d+)$/);
  const numero = Number(chiffres), col = numeroColonne(lettres);
  const donnees = enfants(doc, 'sheetData')[0];
  let ligne = enfants(donnees, 'row').find(r => Number(r.getAttribute('r')) === numero);
  if (!ligne) {
    ligne = doc.createElementNS(ns, 'row'); ligne.setAttribute('r', String(numero));
    const apres = enfants(donnees, 'row').find(r => Number(r.getAttribute('r')) > numero);
    donnees.insertBefore(ligne, apres || null);
  }
  ligne.removeAttribute('spans');           // simple indication pour Excel, recalculée à l'ouverture
  let c = enfants(ligne, 'c').find(x => x.getAttribute('r') === ref);
  if (!c) {
    c = doc.createElementNS(ns, 'c'); c.setAttribute('r', ref);
    const apres = enfants(ligne, 'c').find(x => numeroColonne(colonne(x.getAttribute('r'))) > col);
    ligne.insertBefore(c, apres || null);
  }
  while (c.firstChild) c.removeChild(c.firstChild);       // ancienne valeur ou formule
  c.removeAttribute('t');
  const el = (nom, texte) => { const e = doc.createElementNS(ns, nom); if (texte !== undefined) e.textContent = texte; return e; };
  if (valeur && typeof valeur === 'object' && valeur.date) {
    // Une date : numéro de jour Excel si la cellule est au format date, sinon texte JJ/MM/AAAA
    if (dates.has(Number(c.getAttribute('s') || 0))) { c.appendChild(el('v', String(jourExcel(valeur.date)))); return; }
    valeur = valeur.date.split('-').reverse().join('/');
  }
  if (typeof valeur === 'number') { c.appendChild(el('v', String(valeur))); return; }
  c.setAttribute('t', 'inlineStr');
  const is = el('is'), t = el('t', String(valeur));
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  is.appendChild(t); c.appendChild(is);
}

export async function modifierClasseur(donnees, { cellules }) {
  const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees);
  const fichiers = lireZip(octets);
  const lire = async nom => { const e = fichiers.get(nom); return e ? extraire(octets, e) : null; };
  const classeurXml = await lire('xl/workbook.xml');
  if (!classeurXml) throw new Error('ce fichier n\'est pas un classeur Excel (.xlsx ou .xlsm)');

  // Première feuille du classeur
  const docClasseur = xml(classeurXml);
  const premiere = enfants(docClasseur, 'sheet')[0];
  const liens = new Map(enfants(xml(await lire('xl/_rels/workbook.xml.rels') || '<r/>'), 'Relationship').map(r => [r.getAttribute('Id'), r]));
  const lien = liens.get(premiere.getAttribute('r:id') || premiere.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
  const cheminFeuille = chemin(lien.getAttribute('Target'));

  const doc = xml(await lire(cheminFeuille));
  const dates = stylesDate(await lire('xl/styles.xml'));
  for (const [ref, valeur] of Object.entries(cellules)) ecrireCellule(doc, ref, valeur, dates);

  // Excel recalcule tout à l'ouverture ; la chaîne de calcul (calcChain) est retirée, Excel la refait
  let calc = enfants(docClasseur, 'calcPr')[0];
  if (!calc) {
    // calcPr doit être à sa place dans workbook.xml (Excel vérifie l'ordre des éléments)
    calc = docClasseur.createElementNS(docClasseur.documentElement.namespaceURI, 'calcPr');
    const suivants = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
    const avant = [...docClasseur.documentElement.children].find(e => suivants.includes(e.localName));
    docClasseur.documentElement.insertBefore(calc, avant || null);
  }
  calc.setAttribute('fullCalcOnLoad', '1');
  // Une seule déclaration XML en tête (certains navigateurs la recopient déjà)
  const ecrire = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, '');
  const modifies = new Map([[cheminFeuille, ecrire(doc)], ['xl/workbook.xml', ecrire(docClasseur)]]);
  const retires = new Set(['xl/calcChain.xml']);
  const rels = await lire('xl/_rels/workbook.xml.rels');
  if (rels && fichiers.has('xl/calcChain.xml')) {
    const d = xml(rels);
    enfants(d, 'Relationship').filter(r => /calcChain/.test(r.getAttribute('Type'))).forEach(r => r.remove());
    modifies.set('xl/_rels/workbook.xml.rels', ecrire(d));
    const types = xml(await lire('[Content_Types].xml'));
    enfants(types, 'Override').filter(o => o.getAttribute('PartName') === '/xl/calcChain.xml').forEach(o => o.remove());
    modifies.set('[Content_Types].xml', ecrire(types));
  }

  const entrees = [];
  const enc = new TextEncoder();
  for (const [nom, e] of fichiers) {
    if (retires.has(nom)) continue;
    if (modifies.has(nom)) {
      const brut = enc.encode(modifies.get(nom));
      entrees.push({ nom, donnees: await compresser(brut), methode: 8, crc: crc32(brut), tailleBrute: brut.length, heure: e.heure, date: e.date });
    } else {
      // Fichier inchangé : recopié tel quel, encore compressé
      entrees.push({ nom, donnees: octets.subarray(e.debut, e.debut + e.taille), methode: e.methode, crc: e.crc, tailleBrute: e.tailleBrute, heure: e.heure, date: e.date });
    }
  }
  return ecrireZip(entrees);
}
