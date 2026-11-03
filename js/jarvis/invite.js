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
import { analyser } from './analyse.js';
import { proposer, apercu } from './completion.js';
import { esc } from './actions.js';
import { typeParCode, statutParCode } from '../config.js';
import { formater } from '../dates.js';
import { formaterMontant } from '../dossiers.js';
import { ressembleAUneListe } from '../collage.js';
import { plat } from './grammaire.js';
import { optionsDossier } from './menus.js';

const CLE_HISTORIQUE = 'gcblo.v2.historique';
/** L'invite, façon bash : utilisateur@machine:chemin$ */
const INVITE = '<span class="pr-hote">dylan@gcblo</span>:<span class="pr-chemin">~</span>$';
const TYPE_COURT = { NUM21: 'NUM21', AIR: 'AIR', SOGETREL: 'SOGE' };
const STATUT_COURT = { A_FAIRE: 'À faire', EN_VALIDATION: 'En valid.', MAD: 'Mis à disp', REFUSE: 'Refusé' };

/** Le GCBLO cliquable : un clic lance « open ‹gcblo› ». */
const lienDossier = d => `<button type="button" class="lien c-dossier" data-commande="open ${esc(d.gcblo)}" title="open ${esc(d.gcblo)}">${esc(d.gcblo)}</button>`;
/** Le bouton ⋯ : ouvre le menu d'actions du dossier (menus.js). */
const boutonMenu = d => `<button type="button" class="points" data-menu-dossier="${esc(d.id)}" aria-label="Actions pour ${esc(d.gcblo)}" aria-haspopup="menu">⋯</button>`;

export function creerInvite({ racine, contexte }) {
  const $ = sel => racine.querySelector(sel);
  const ecranEl = $('#ecran'), champ = $('#saisie'), miroir = $('#miroir'), listeEl = $('#propositions'), aideEl = $('#aideLigne'), inviteEl = $('#invite');

  let etat = { analyse: null, prop: { propositions: [] }, choisi: -1 };
  let historique = [];
  try { historique = JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; } catch { /* historique facultatif */ }
  let posHistorique = -1;
  let attente = null;            // question en cours : { resoudre, choix: null (oui/non) | ['…', …] }
  let executer = async () => {};
  let surCollage = null;         // reçoit le texte d'une liste collée
  let listeDemandee = false;     // Tab sur une ligne vide : afficher toutes les commandes

  /* ---------------- Zone de sortie ---------------- */

  const defiler = () => { ecranEl.scrollTop = ecranEl.scrollHeight; };

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

  const ecran = {
    ligne(html, classe = '') {
      const div = document.createElement('div');
      div.className = `l ${classe}`;
      div.innerHTML = html;
      ecranEl.appendChild(div);
      defiler();
    },
    /**
     * Liste de dossiers, alignée (police à chasse fixe), courte pour tenir sur téléphone.
     * Le GCBLO est cliquable (→ « open ») ; ⋯ ouvre le menu d'actions du dossier.
     */
    tableau(dossiers) {
      const col = (t, n) => esc(String(t).padEnd(n).slice(0, n));
      const lignes = dossiers.map(d => {
        const alerte = contexte().regles.etatRelance(d);
        const relance = d.dateRelance ? formater(d.dateRelance).slice(0, 5) + (alerte === 'retard' ? '!' : alerte === 'proche' ? '·' : '') : '—';
        return `<span class="ty-${d.type}">${col(TYPE_COURT[d.type] || d.type, 6)}</span>`
          + `${lienDossier(d)} `
          + `<span class="st-${d.statutDft}">${col(STATUT_COURT[d.statutDft] || d.statutDft, 11)}</span>`
          + `<span class="${alerte || 'dim'}">${col(relance, 6)}</span>`
          + boutonMenu(d);
      });
      const entete = `<span class="dim">${'TYPE'.padEnd(6)}${'GCBLO'.padEnd(17)}${'STATUT'.padEnd(11)}RELANCE</span>`;
      ecran.ligne(`<pre class="tableau">${[entete, ...lignes].join('\n')}</pre>`, 'vue');
    },
    fiche(d) {
      const regles = contexte().regles;
      const alerte = regles.etatRelance(d);
      const champ = (nom, valeur) => `<span class="dim">${esc(nom.padEnd(14))}</span>${valeur}`;
      const lignes = [
        `<b>${lienDossier(d)}</b> ${boutonMenu(d)}`,
        champ('type', `<span class="ty-${d.type}">${esc(typeParCode(d.type).libelle)}</span>`),
        champ('statut DFT', `<span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span>`),
        champ('FCI', esc(d.fci.join(', ') || 'aucun')),
        champ('commune', esc(d.commune || '—')),
        champ('valorisation', d.valorisation !== null && d.valorisation !== undefined ? esc(formaterMontant(d.valorisation)) : '—'),
        champ('affectation', esc(formater(d.dateAffectation))),
        champ('relance', d.dateRelance ? `<span class="${alerte || ''}">${esc(formater(d.dateRelance))}${alerte === 'retard' ? ' (en retard)' : alerte === 'proche' ? ' (proche)' : ''}</span>` : 'aucune'),
        champ('commentaire', esc(d.commentaire || '—').replace(/\n/g, '<br>' + ' '.repeat(14))),
        `<span class="dim">historique</span>`,
        ...[...d.historique].reverse().slice(0, 8).map(h => `  <span class="dim">${esc(new Date(h.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>  ${esc(h.detail)}`)
      ];
      ecran.ligne(`<pre class="fiche">${lignes.join('\n')}</pre>`, 'vue');
    },
    /** Les listes et fiches déjà affichées ne sont plus à jour : on les grise. */
    marquerPerime() { ecranEl.querySelectorAll('.vue:not(.perime)').forEach(el => el.classList.add('perime')); },
    vider() { ecranEl.innerHTML = ''; }
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
    ecran.ligne(`<span class="invite-echo">${INVITE}</span> ${colorer(texte, analyse)}`, 'echo');
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
    // Sur grand écran, le menu s'ouvre contre le bouton ; sur téléphone, en bas (CSS)
    if (!matchMedia('(max-width: 640px)').matches) {
      const r = bouton.getBoundingClientRect(), h = menuEl.offsetHeight, w = menuEl.offsetWidth;
      const haut = r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
      menuEl.style.top = `${haut}px`;
      menuEl.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    }
    menuEl.querySelector('.menu-choix')?.focus();
  }

  racine.addEventListener('click', e => {
    const cmd = e.target.closest('[data-commande]');
    const points = e.target.closest('[data-menu-dossier]');
    if (cmd) { e.preventDefault(); lancer(cmd.dataset.commande); return; }
    if (points) { e.preventDefault(); menuEl && points.getAttribute('aria-expanded') === 'true' ? fermerMenu() : ouvrirMenu(points, points.dataset.menuDossier); return; }
    if (menuEl && !e.target.closest('.menu')) fermerMenu();
    // Clic ailleurs dans l'écran : on revient à la saisie (sauf sur téléphone : pas de clavier imposé)
    if (e.target.closest('#ecran') && !getSelection().toString() && matchMedia('(pointer: fine)').matches) champ.focus();
  });
  racine.addEventListener('keydown', e => {
    if (!menuEl) return;
    const choix = [...menuEl.querySelectorAll('.menu-choix')], i = choix.indexOf(racine.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerMenu(); champ.focus(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && i >= 0) { e.preventDefault(); choix[(i + (e.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length].focus(); }
  }, true);
  ecranEl.addEventListener('scroll', () => { if (menuEl && !matchMedia('(max-width: 640px)').matches) fermerMenu(); });

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
