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
    const methode = v.getUint16(p + 10, true);
    const taille = v.getUint32(p + 20, true);
    const lnNom = v.getUint16(p + 28, true), lnExtra = v.getUint16(p + 30, true), lnComm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = texte.decode(octets.subarray(p + 46, p + 46 + lnNom));
    // L'en-tête local a sa propre longueur de nom et de champ extra
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    fichiers.set(nom, { methode, taille, debut });
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
