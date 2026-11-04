/**
 * invite.js — l'écran du terminal : la zone de sortie et la ligne de saisie.
 *
 * À chaque touche :  analyser() → proposer() + apercu() → affichage
 *   - les mots sont colorés selon leur rôle (calque « miroir » derrière le champ),
 *   - la meilleure proposition s'affiche en grisé après le curseur (texte fantôme),
 *   - la liste des propositions s'ouvre au-dessus de la ligne,
 *   - l'aperçu ou l'erreur s'affiche en gris sur la ligne même, après le texte tapé.
 * À Entrée : la commande est recopiée à l'écran, puis exécutée par actions.js.
 *
 * Clavier : Tab / → acceptent · ↑ ↓ parcourent (propositions, sinon historique)
 *           Entrée exécute (ou choisit la proposition sélectionnée) · Échap ferme puis vide.
 */
import { analyser, criteresListe } from './analyse.js';
import { chercherListe } from '../info.js';
import { proposer, apercu } from './completion.js';
import { esc } from './actions.js';
import { STATUTS, typeParCode, statutParCode } from '../config.js';
import { formater } from '../dates.js';
import { formaterMontant } from '../dossiers.js';
import { ressembleAUneListe } from '../collage.js';
import { plat, MOTS_TYPE, MOTS_STATUT, motPourCode } from './grammaire.js';
import { optionsDossier } from './menus.js';

const CLE_HISTORIQUE = 'gcblo.v2.historique';
/** L'invite, façon bash : utilisateur@machine:chemin$ */
const INVITE = '<span class="pr-hote">dylan@gcblo</span>:<span class="pr-chemin">~</span>$';
const TYPE_COURT = { NUM21: 'NUM21', AIR: 'AIR', SOGETREL: 'SOGE' };
const STATUT_COURT = { A_FAIRE: 'À faire', EN_VALIDATION: 'En valid.', MAD: 'Mis à disp', REFUSE: 'Refusé', LITIGE: 'Litige', ANNULE: 'Annulé', ATTACH: 'Attach' };

/** Le GCBLO cliquable : un clic lance « open ‹gcblo› ». */
const lienDossier = d => `<button type="button" class="lien c-dossier" data-commande="open ${esc(d.gcblo)}" title="open ${esc(d.gcblo)}">${esc(d.gcblo)}</button>`;
/** Le bouton ⋯ : ouvre le menu d'actions du dossier (menus.js). */
const boutonMenu = d => `<button type="button" class="points" data-menu-dossier="${esc(d.id)}" aria-label="Actions pour ${esc(d.gcblo)}" aria-haspopup="menu">⋯</button>`;

export function creerInvite({ racine, contexte }) {
  const $ = sel => racine.querySelector(sel);
  const ecranEl = $('#ecran'), voletEl = $('#volet'), champ = $('#saisie'), miroir = $('#miroir'), listeEl = $('#propositions'), aideEl = $('#aideLigne'), inviteEl = $('#invite');

  let etat = { analyse: null, prop: { propositions: [] }, choisi: -1 };
  let historique = [];
  try { historique = JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; } catch { /* historique facultatif */ }
  let posHistorique = -1;
  let attente = null;            // question en cours : { resoudre, choix: null (oui/non) | ['…', …] }
  let executer = async () => {};
  let surCollage = null;         // reçoit le texte d'une liste collée
  let listeDemandee = false;     // Tab sur une ligne vide : afficher toutes les commandes

  /* ---------------- Zone de sortie ---------------- */

  /*
   * Où s'écrit la sortie : la console, ou le volet de droite (sous le tableau de bord) pour
   * les commandes qui ne doivent pas faire défiler la console (open, set, edit, cancel, help).
   */
  const DANS_LE_VOLET = new Set(['open', 'set', 'edit', 'cancel', 'help', 'sauvegarde']);
  const VIDE_LA_CONSOLE = new Set(['ls', 'info']);
  let sortie = ecranEl;
  const defiler = () => { sortie.scrollTop = sortie.scrollHeight; };

  /** Le texte d'une ligne avec la couleur de chaque mot (pour l'écho des commandes). */
  function colorer(texte, analyse) {
    let html = '', pos = 0;
    for (const m of analyse?.mots || []) {
      html += esc(texte.slice(pos, m.debut));
      html += `<span class="c-${m.role || 'brut'}">${esc(texte.slice(m.debut, m.fin))}</span>`;
      pos = m.fin;
    }
    return html + esc(texte.slice(pos));
  }

  /**
   * La fiche d'un dossier. Chaque valeur est éditable au double-clic (data-champ) :
   * la saisie lance la commande « edit ‹gcblo› ‹champ› ‹valeur› » (un clic = une commande).
   */
  function ficheHtml(d) {
    const alerte = contexte().regles.etatRelance(d);
    const champ = (nom, cle, valeur) => `<span class="dim">${esc(nom.padEnd(14))}</span><span class="editable" data-champ="${cle}" title="double-clic pour modifier">${valeur}</span>`;
    const lignes = [
      `<b>${lienDossier(d)}</b> ${boutonMenu(d)}`,
      champ('affect', 'affect', `<span class="ty-${d.type}">${esc(typeParCode(d.type).libelle)}</span>`),
      champ('statut DFT', 'statut', `<span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span>`),
      champ('FCI', 'fci', esc(d.fci.join(', ') || 'aucun')),
      champ('commune', 'commune', esc(d.commune || '—')),
      champ('valorisation', 'valo', d.valorisation !== null && d.valorisation !== undefined ? esc(formaterMontant(d.valorisation)) : '—'),
      champ('affectation', 'affectation', esc(formater(d.dateAffectation))),
      champ('relance', 'relance', d.dateRelance ? `<span class="${alerte || ''}">${esc(formater(d.dateRelance))}${alerte === 'retard' ? ' (en retard)' : alerte === 'proche' ? ' (proche)' : ''}</span>` : 'aucune'),
      champ('commentaire', 'commentaire', esc(d.commentaire || '—').replace(/\n/g, '<br>' + ' '.repeat(14))),
      `<span class="dim">historique</span>`,
      ...[...d.historique].reverse().slice(0, 8).map(h => `  <span class="dim">${esc(new Date(h.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>  ${esc(h.detail)}`)
    ];
    return `<pre class="fiche">${lignes.join('\n')}</pre>`;
  }

  /** La valeur d'un champ telle qu'on la retape (pour pré-remplir la saisie en place). */
  function valeurBrute(d, cle) {
    switch (cle) {
      case 'affect': return motPourCode(MOTS_TYPE, d.type);
      case 'statut': return motPourCode(MOTS_STATUT, d.statutDft);
      case 'fci': return d.fci.join(' ');
      case 'commune': return d.commune || '';
      case 'valo': return d.valorisation !== null && d.valorisation !== undefined ? String(d.valorisation).replace('.', ',') : '';
      case 'affectation': return formater(d.dateAffectation);
      case 'relance': return d.dateRelance ? formater(d.dateRelance) : '';
      case 'commentaire': return (d.commentaire || '').replace(/\n/g, ' ');
      default: return '';
    }
  }

  function tableauHtml(dossiers) {
    const col = (t, n) => esc(String(t).padEnd(n).slice(0, n));
    const coupe = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
    const lignes = dossiers.map(d => {
      const fci = d.fci.length ? d.fci[0] + (d.fci.length > 1 ? `+${d.fci.length - 1}` : '') : '';
      const commune = d.commune || '';
      const valo = d.valorisation !== null && d.valorisation !== undefined ? formaterMontant(d.valorisation).replace(/\s/g, ' ') : '';
      // Chaque cellule est éditable au double-clic, comme dans la fiche (data-champ, data-dossier)
      const ed = (cle, html) => `<span class="editable" data-champ="${cle}" data-dossier="${esc(d.id)}" title="double-clic pour modifier">${html}</span>`;
      // Ordre des colonnes : AFFECT GCBLO COMMUNE VALO FCI STATUT DFT
      const milieu = `${ed('commune', col(coupe(commune, 22) || '—', 22))} ${ed('valo', `<span class="valo">${esc((valo || '—').padStart(11))}</span>`)}  ${ed('fci', `<span class="dim">${col(fci || '—', 15)}</span>`)} `;
      // Une ligne = un bloc : le statut peut colorer toute la ligne (Attach : vert clair)
      return `<span class="rangee rangee-${d.statutDft}">`
        + `${ed('affect', `<span class="ty-${d.type}">${col(TYPE_COURT[d.type] || d.type, 6)}</span>`)} `
        + `${lienDossier(d)} `
        + milieu
        + ed('statut', `<span class="st-${d.statutDft}">${col(STATUT_COURT[d.statutDft] || d.statutDft, 11)}</span>`)
        + boutonMenu(d) + '</span>';
    });
    // L'en-tête reste visible en haut de l'écran tant que la liste défile (CSS : sticky)
    const entete = `<span class="entete dim">${'AFFECT'.padEnd(7)}${'GCBLO'.padEnd(17)}`
      + `${'COMMUNE'.padEnd(23)}${'VALO'.padStart(11)}  ${'FCI'.padEnd(16)}STATUT DFT</span>`;
    return `<pre class="tableau">${entete}${lignes.join('')}</pre>`;
  }

  const ecran = {
    ligne(html, classe = '') {
      const div = document.createElement('div');
      div.className = `l ${classe}`;
      div.innerHTML = html;
      sortie.appendChild(div);
      defiler();
    },
    /**
     * Liste de dossiers, alignée (police à chasse fixe).
     * Le GCBLO est cliquable (→ « open ») ; ⋯ ouvre le menu d'actions du dossier.
     */
    tableau(dossiers) {
      ecran.ligne(tableauHtml(dossiers), 'vue');
      sortie.lastElementChild.dataset.liste = dossiers.map(d => d.id).join(',');
    },
    fiche(d) {
      ecran.ligne(ficheHtml(d), 'vue');
      const el = sortie.lastElementChild;
      el.dataset.fiche = d.id;
    },
    /** Les listes et fiches déjà affichées ne sont plus à jour : on les grise. */
    /**
     * Un dossier a changé : les listes et fiches affichées se mettent à jour sur place
     * (même ordre, mêmes dossiers). Un dossier supprimé disparaît des listes ; sa fiche passe en grisé.
     */
    rafraichirVues() {
      const dossiers = contexte().dossiers, parId = new Map(dossiers.map(d => [d.id, d]));
      racine.querySelectorAll('.vue[data-liste]').forEach(vue => {
        if (vue.querySelector('.edition')) return;          // saisie en cours : on n'y touche pas
        vue.innerHTML = tableauHtml(vue.dataset.liste.split(',').map(i => parId.get(i)).filter(Boolean));
      });
      racine.querySelectorAll('.vue[data-fiche]').forEach(vue => {
        if (vue.querySelector('.edition')) return;
        const d = parId.get(vue.dataset.fiche);
        if (d) { vue.innerHTML = ficheHtml(d); vue.classList.remove('perime'); } else vue.classList.add('perime');
      });
    },
    vider() { ecranEl.innerHTML = ''; if (voletEl) voletEl.innerHTML = ''; }
  };

  /* ---------------- Ligne de saisie ---------------- */

  /** Recalcule tout à partir du texte et du curseur, puis redessine. */
  function rafraichir() {
    // Pendant une question oui/non : on affiche juste ce qui est tapé, sans analyse
    if (attente) {
      // Question à choix : les choix possibles sont proposés comme d'habitude
      const choix = attente.choix ? attente.choix.filter(c => c.startsWith(plat(champ.value))) : [];
      const fantome = choix.length && champ.value ? choix[0].slice(champ.value.length) : '';
      etat = { analyse: null, choisi: -1, prop: { propositions: choix.map(c => ({ inserer: c, libelle: c, detail: '', sorte: 'valeur' })), fantome, remplace: { debut: 0, fin: champ.value.length } } };
      miroir.innerHTML = esc(champ.value) + (fantome ? `<span class="fantome">${esc(fantome)}</span>` : '');
      poserIndice();
      dessinerPropositions();
      return;
    }
    const texte = champ.value, curseur = champ.selectionStart ?? texte.length;
    const ctx = contexte();
    const analyse = analyser(texte, curseur, ctx);
    // Ligne vide : pas de liste (elle masquerait l'écran), sauf si on la demande avec Tab
    const prop = texte.trim() || listeDemandee ? proposer(analyse, ctx) : { propositions: [] };
    listeDemandee = false;
    etat = { analyse, prop, choisi: -1 };
    // Couleurs + texte fantôme (affiché seulement si le curseur est en fin de ligne)
    const fantome = curseur === texte.length ? prop.fantome : '';
    miroir.innerHTML = colorer(texte, analyse) + (fantome ? `<span class="fantome">${esc(fantome)}</span>` : '');
    synchroniserDefilement();
    dessinerPropositions();
    // Ligne d'aide : erreur sur le mot courant, sinon erreur, sinon aperçu
    const msg = analyse.erreurs[0] || (texte.trim() && analyse.erreurCourante && curseur < texte.length ? analyse.erreurCourante : null);
    aideEl.className = `aide-ligne ${msg ? 'err' : ''}`;
    aideEl.textContent = msg ? msg : (texte.trim() ? apercu(analyse, ctx) || '' : '');
    poserIndice();
  }

  /**
   * L'aide (aperçu, erreur, consigne) s'affiche en gris sur la ligne de saisie elle-même,
   * juste après le texte tapé : la zone de saisie tient sur une seule ligne.
   * #aideLigne garde le texte pour les lecteurs d'écran.
   */
  function poserIndice() {
    miroir.querySelector('.indice')?.remove();
    const texte = aideEl.textContent;
    if (!texte) return;
    const span = document.createElement('span');
    span.className = `indice${aideEl.classList.contains('err') ? ' err' : ''}`;
    span.textContent = (champ.value ? '   ' : '') + texte;
    miroir.append(span);
  }

  function synchroniserDefilement() { miroir.style.transform = `translateX(${-champ.scrollLeft}px)`; }

  function dessinerPropositions() {
    const { propositions } = etat.prop;
    listeEl.hidden = !propositions.length || (attente !== null && !attente.choix);
    listeEl.innerHTML = propositions.map((p, i) => `
      <li role="option" data-i="${i}" class="${i === etat.choisi ? 'choisi' : ''} ${p.alerte || ''}" aria-selected="${i === etat.choisi}">
        <span class="p-libelle c-${p.sorte === 'verbe' ? 'verbe' : p.sorte === 'dossier' ? 'dossier' : p.sorte === 'mot' ? 'mot' : 'valeur'}">${esc(p.libelle)}</span>
        <span class="p-detail">${esc(p.detail || '')}</span>
      </li>`).join('');
    listeEl.querySelector('.choisi')?.scrollIntoView({ block: 'nearest' });
  }

  /** Remplace le mot sous le curseur par la proposition. */
  function accepter(i = Math.max(etat.choisi, 0)) {
    const p = etat.prop.propositions[i];
    if (!p || !etat.prop.remplace) return false;
    const { debut, fin } = etat.prop.remplace;
    const avant = champ.value.slice(0, debut), apres = champ.value.slice(fin);
    const insere = apres.startsWith(' ') ? p.inserer.trimEnd() : p.inserer;
    champ.value = avant + insere + apres;
    const pos = (avant + insere).length + (apres.startsWith(' ') ? 1 : 0);
    champ.setSelectionRange(pos, pos);
    rafraichir();
    return true;
  }

  async function valider() {
    const texte = champ.value.trim();
    if (attente) {
      const r = attente; attente = null;
      // Oui/non, ou le choix qui commence par ce qui est tapé (un seul possible)
      const trouves = r.choix ? r.choix.filter(c => c === plat(texte) || (texte && c.startsWith(plat(texte)))) : [];
      const reponse = r.choix ? (trouves.length === 1 ? trouves[0] : null) : /^(o|oui|y|yes)$/i.test(texte);
      ecran.ligne(`<span class="dim">${esc(inviteEl.textContent)}</span> ${esc(r.choix ? (reponse || 'annulé') : (reponse ? 'oui' : 'non'))}`, 'echo');
      remettreInvite(); champ.value = '';
      r.resoudre(reponse);
      rafraichir();
      return;
    }
    if (!texte) return;
    champ.value = '';
    await lancer(texte);
  }

  /**
   * Recopie une commande à l'écran puis l'exécute. Sert à la saisie (Entrée)
   * ET aux clics : un clic = une commande, avec écho, historique et « cancel ».
   */
  async function lancer(texte) {
    if (attente) return;
    fermerMenu();
    const analyse = analyser(texte, texte.length, contexte());
    const id = analyse.commande?.id;
    let echoDansLeVolet = false;
    if (voletEl && DANS_LE_VOLET.has(id)) sortie = voletEl;
    if (voletEl && VIDE_LA_CONSOLE.has(id) && analyse.complet) {
      // ls (list) et info : la commande s'écrit dans le volet, comme les autres ;
      // la console est vidée et ne montre que la liste. Sans résultat, tout va dans le volet
      // et la liste déjà affichée reste en place.
      echoDansLeVolet = true;
      if (aucunResultat(analyse)) sortie = voletEl; else ecranEl.innerHTML = '';
    }
    try { await lancerDans(texte, analyse, echoDansLeVolet); } finally { sortie = ecranEl; }
  }

  /** ls ou info ne trouveraient aucun dossier ? */
  function aucunResultat(analyse) {
    const ctx = contexte();
    if (analyse.commande.id === 'ls') return !ctx.regles.filtrer(criteresListe(analyse.valeurs)).length;
    if (analyse.commande.id === 'info') return !chercherListe(analyse.valeurs.liste, ctx.dossiers).trouves.length;
    return false;
  }

  async function lancerDans(texte, analyse, echoDansLeVolet = false) {
    const ici = sortie;
    if (echoDansLeVolet) sortie = voletEl;
    ecran.ligne(`<span class="invite-echo">${INVITE}</span> ${colorer(texte, analyse)}`, 'echo');
    sortie = ici;
    historique = [texte, ...historique.filter(h => h !== texte)].slice(0, 100);
    try { localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(historique)); } catch { /* facultatif */ }
    posHistorique = -1;
    rafraichir();

    if (!analyse.commande) return ecran.ligne(`gcblo: ${esc(analyse.erreurs[0] || `${texte.split(/\s+/)[0]} : commande introuvable`)}`, 'err');
    if (!analyse.complet) {
      const pb = analyse.erreurs[0] || analyse.erreurCourante || `il manque : ${analyse.manquants.join(', ')}`;
      return ecran.ligne(`${esc(analyse.commande.verbes[0])}: ${esc(pb)}<br><span class="dim">usage : ${esc(analyse.commande.forme)}</span>`, 'err');
    }
    contexte().memoriser?.(analyse.commande.id);
    await executer(analyse);
    rafraichir();
  }

  function remettreInvite() { inviteEl.innerHTML = INVITE; inviteEl.classList.remove('question'); }

  /* ---------------- Événements ---------------- */

  champ.addEventListener('input', () => { posHistorique = -1; rafraichir(); });
  champ.addEventListener('click', rafraichir);
  champ.addEventListener('focus', rafraichir);
  champ.addEventListener('scroll', synchroniserDefilement);
  champ.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) rafraichir(); });
  champ.addEventListener('keydown', e => {
    const n = etat.prop.propositions.length;
    const ouvert = !listeEl.hidden && n > 0;
    if (e.key === 'Tab') {
      e.preventDefault();
      // Tab insère la proposition sélectionnée, ou la meilleure (↑ ↓ servent à choisir) ;
      // sur une ligne vide, Tab affiche toutes les commandes
      if (ouvert) accepter(etat.choisi >= 0 ? etat.choisi : 0);
      else if (!champ.value.trim() && !attente) { listeDemandee = true; rafraichir(); }
    } else if (e.key === 'ArrowRight' && champ.selectionStart === champ.value.length && etat.prop.fantome) {
      e.preventDefault(); accepter(0);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      if (ouvert && (champ.value.trim() || etat.choisi >= 0)) {
        etat.choisi = (etat.choisi + delta + n) % n; dessinerPropositions();
      } else if (historique.length) {
        posHistorique = Math.max(-1, Math.min(historique.length - 1, posHistorique - delta));
        champ.value = posHistorique >= 0 ? historique[posHistorique] : '';
        champ.setSelectionRange(champ.value.length, champ.value.length);
        const garde = posHistorique; rafraichir(); posHistorique = garde;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (ouvert && etat.choisi >= 0) { accepter(etat.choisi); if (attente?.choix) valider(); } else valider();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (ouvert) { listeEl.hidden = true; etat.choisi = -1; } else { champ.value = ''; rafraichir(); }
    }
  });
  listeEl.addEventListener('mousedown', e => e.preventDefault());       // garder le focus dans le champ
  listeEl.addEventListener('click', e => {
    const li = e.target.closest('[data-i]');
    if (li) { accepter(Number(li.dataset.i)); if (attente?.choix) valider(); }
    champ.focus();
  });
  // Coller une liste (plusieurs GCBLO, ou plusieurs lignes) : traitée comme un lot, pas comme une commande
  champ.addEventListener('paste', async e => {
    const texte = e.clipboardData?.getData('text') || '';
    // Une colonne collée (Excel…) : les retours à la ligne et tabulations deviennent des espaces,
    // sinon le navigateur recolle les lignes bout à bout (« info » puis une colonne de GCBLO)
    if (!surCollage && /[\r\n\t]/.test(texte.trim())) {
      e.preventDefault();
      const propre = texte.split(/[\r\n\t]+/).map(t => t.trim()).filter(Boolean).join(' ');
      const debut = champ.selectionStart, avant = champ.value.slice(0, debut);
      const insere = (avant && !/\s$/.test(avant) ? ' ' : '') + propre;
      champ.setRangeText(insere, debut, champ.selectionEnd, 'end');
      rafraichir();
      return;
    }
    if (attente || !surCollage || !ressembleAUneListe(texte)) return;
    e.preventDefault();
    const lignes = texte.split(/\r?\n/).filter(l => l.trim()).length;
    ecran.ligne(`<span class="invite-echo">${INVITE}</span> <span class="dim">(liste collée : ${lignes} ligne${lignes > 1 ? 's' : ''})</span>`, 'echo');
    await surCollage(texte);
    rafraichir();
  });
  /* ---------------- Clics : un clic = une commande ---------------- */

  let menuEl = null, menuBouton = null;
  function fermerMenu() { menuEl?.remove(); menuEl = null; menuBouton?.setAttribute('aria-expanded', 'false'); menuBouton = null; }

  /** Ouvre le menu ⋯ d'un dossier, construit selon son état actuel. */
  function ouvrirMenu(bouton, id) {
    fermerMenu();
    const d = contexte().dossiers.find(x => x.id === id);
    if (!d) return ecran.ligne('gcblo: ce dossier n\'existe plus', 'err');
    menuEl = document.createElement('div');
    menuEl.className = 'menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = `<div class="menu-titre"><span class="c-dossier">${esc(d.gcblo)}</span> <span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span></div>`
      + optionsDossier(d).map(o => `<button type="button" role="menuitem" class="menu-choix" data-commande="${esc(o.commande)}" title="${esc(o.commande)}">`
        + `<span class="${o.classe || ''}">${esc(o.libelle)}</span></button>`).join('');
    racine.body.appendChild(menuEl);
    menuBouton = bouton; bouton.setAttribute('aria-expanded', 'true');
    // Le menu s'ouvre contre le bouton
    const r = bouton.getBoundingClientRect(), h = menuEl.offsetHeight, w = menuEl.offsetWidth;
    const haut = r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    menuEl.style.top = `${haut}px`;
    menuEl.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    menuEl.querySelector('.menu-choix')?.focus();
  }

  racine.addEventListener('click', e => {
    const cmd = e.target.closest('[data-commande]');
    const points = e.target.closest('[data-menu-dossier]');
    if (cmd) { e.preventDefault(); lancer(cmd.dataset.commande); return; }
    if (points) { e.preventDefault(); menuEl && points.getAttribute('aria-expanded') === 'true' ? fermerMenu() : ouvrirMenu(points, points.dataset.menuDossier); return; }
    if (menuEl && !e.target.closest('.menu')) fermerMenu();
    // Clic ailleurs dans l'écran : on revient à la saisie
    if (e.target.closest('#ecran, #volet') && !e.target.closest('.edition, .editable') && !getSelection().toString()) champ.focus();
  });
  /* ---------------- Fiche : double-clic sur un champ pour le modifier ---------------- */

  const surDoubleClic = e => {
    // Fiche (open) ou liste (ls) : le dossier vient de la fiche, ou de la cellule dans une liste
    const cible = e.target.closest('.editable');
    const vue = cible?.closest('[data-fiche], [data-liste]');
    if (!cible || !vue || attente || cible.querySelector('.edition')) return;
    const id = cible.dataset.dossier || vue.dataset.fiche;
    const d = contexte().dossiers.find(x => x.id === id);
    if (!d) return ecran.ligne('gcblo: ce dossier n\'existe plus', 'err');
    getSelection()?.removeAllRanges();
    const cle = cible.dataset.champ, avant = valeurBrute(d, cle);
    // Affect et statut : une liste ; le reste : une zone de saisie pré-remplie
    const choix = cle === 'affect' ? Object.keys(MOTS_TYPE) : cle === 'statut' ? STATUTS.map(st => motPourCode(MOTS_STATUT, st.code)) : null;
    const saisie = document.createElement(choix ? 'select' : 'input');
    saisie.className = 'edition';
    if (choix) saisie.innerHTML = choix.map(c => `<option value="${esc(c)}"${c === avant ? ' selected' : ''}>${esc(c)}</option>`).join('');
    else { saisie.value = avant; saisie.size = Math.max(10, Math.min(40, avant.length + 3)); saisie.spellcheck = false; }
    const contenu = cible.innerHTML;
    cible.innerHTML = '';
    cible.appendChild(saisie);
    saisie.focus();
    if (!choix) saisie.select();

    let fini = false;
    const terminer = async valider => {
      if (fini) return;
      fini = true;
      const valeur = saisie.value.trim();
      cible.innerHTML = contenu;
      if (!valider || valeur === avant) return;
      // Un clic = une commande : la modification passe par « edit », visible dans la console
      await lancer(`edit ${d.gcblo} ${cle} ${valeur || '-'}`);
      // La fiche ou la liste se met à jour sur place (les autres vues passent en grisé)
      if (!vue.isConnected) return;
      const dossiers = contexte().dossiers;
      if (vue.dataset.fiche) {
        const maj = dossiers.find(x => x.id === d.id);
        if (maj) { vue.innerHTML = ficheHtml(maj); vue.classList.remove('perime'); }
      } else {
        const liste = vue.dataset.liste.split(',').map(i => dossiers.find(x => x.id === i)).filter(Boolean);
        vue.innerHTML = tableauHtml(liste); vue.classList.remove('perime');
      }
    };
    saisie.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); terminer(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); terminer(false); }
      ev.stopPropagation();
    });
    saisie.addEventListener('blur', () => terminer(true));
    if (choix) saisie.addEventListener('change', () => terminer(true));
  };
  ecranEl.addEventListener('dblclick', surDoubleClic);
  voletEl?.addEventListener('dblclick', surDoubleClic);

  racine.addEventListener('keydown', e => {
    if (!menuEl) return;
    const choix = [...menuEl.querySelectorAll('.menu-choix')], i = choix.indexOf(racine.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerMenu(); champ.focus(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && i >= 0) { e.preventDefault(); choix[(i + (e.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length].focus(); }
  }, true);
  ecranEl.addEventListener('scroll', () => { if (menuEl) fermerMenu(); });
  voletEl?.addEventListener('scroll', () => { if (menuEl) fermerMenu(); });

  return {
    ecran,
    brancher(fn) { executer = fn; },
    brancherCollage(fn) { surCollage = fn; },
    /** Pose une question oui/non dans l'invite elle-même. */
    confirmer(question) {
      return new Promise(resoudre => {
        attente = { resoudre };
        inviteEl.textContent = `${question} [o/n]`;
        inviteEl.classList.add('question');
        listeEl.hidden = true; miroir.innerHTML = ''; aideEl.className = 'aide-ligne'; aideEl.textContent = ''; poserIndice();
        champ.value = ''; champ.focus();
      });
    },
    /** Pose une question à choix ; renvoie le choix, ou null si la réponse ne correspond à aucun. */
    demander(question, choix) {
      return new Promise(resoudre => {
        attente = { resoudre, choix };
        inviteEl.textContent = `${question} [${choix.join('/')}]`;
        inviteEl.classList.add('question');
        aideEl.className = 'aide-ligne'; aideEl.textContent = '';
        champ.value = ''; champ.focus(); rafraichir();
      });
    },
    rafraichir,
    /** Lance une commande comme si elle avait été tapée (utilisé par les clics). */
    lancer,
    focus: () => champ.focus()
  };
}
