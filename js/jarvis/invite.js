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
import { analyser, criteresListe, resultatLs } from './analyse.js';
import { proposer, apercu } from './completion.js';
import { esc } from './actions.js';
import { STATUTS, typeParCode, statutParCode } from '../config.js';
import { formater } from '../dates.js';
import { formaterMontant, etatFci, relanceRecente } from '../dossiers.js';
import { lireLies, liesDe, totalLies, chaleurs, chaleur } from '../dossiers-lies.js';
import { ressembleAUneListe } from '../collage.js';
import { plat, MOTS_TYPE, MOTS_STATUT, motPourCode } from './grammaire.js';
import { optionsDossier } from './menus.js';

const CLE_HISTORIQUE = 'gcblo.v2.historique';
/** L'invite, façon bash : utilisateur@machine:chemin$ */
const INVITE = '<span class="pr-hote">dylan@gcblo</span>:<span class="pr-chemin">~</span>$';
const TYPE_COURT = { NUM21: 'NUM21', AIR: 'AIR', SOGETREL: 'SOGE' };
const STATUT_COURT = { A_FAIRE: 'À faire', EN_VALIDATION: 'En valid.', ATTENTE_TRAVAUX: 'Att. trav.', MAD: 'Mis à disp', REFUSE: 'Refusé', LITIGE: 'Litige', ANNULE: 'Annulé', ATTACH: 'Attach' };

/** Le GCBLO cliquable : un clic lance « open ‹gcblo› ». */
const lienDossier = d => `<button type="button" class="lien c-dossier" data-commande="open ${esc(d.gcblo)}" data-copie="${esc(d.gcblo)}" title="clic : open ${esc(d.gcblo)} · clic droit : copier">${esc(d.gcblo)}</button>`;
/** Les FCI d'un dossier, copiables d'un clic droit (tous, séparés par une espace). */
const copieFci = (d, html) => d.fci.length ? `<span data-copie="${esc(d.fci.join(' '))}" title="clic droit : copier">${html}</span>` : html;
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
  let listeDemandee = false;
  let commandeEnCours = '';
  const vivantes = new Map();    // vues redessinées à chaque changement (élément → dessiner)
  const choisis = new Set();     // sélection multiple dans les listes (Ctrl+clic, Maj+clic) : ids des dossiers
  let dernierChoisi = null;      // la commande en train de s'exécuter (une liste retient son « ls »)

  /* ---------------- Zone de sortie ---------------- */

  /*
   * Où s'écrit la sortie : la console, ou le volet de droite (sous le tableau de bord) pour
   * les commandes qui ne doivent pas faire défiler la console (open, set, edit, cancel, help).
   */
  const DANS_LE_VOLET = new Set(['morpion', 'dame', 'open', 'set', 'edit', 'fci', 'cancel', 'help', 'save', 'restore', 'attachement', 'delete', 'affect', 'relance']);
  const VIDE_LA_CONSOLE = new Set(['ls', 'today']);
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
    const champ = (nom, cle, valeur, classe = '') => `<span class="dim">${esc(nom.padEnd(10))}</span><span class="editable${classe ? ` ${classe}` : ''}" data-champ="${cle}" title="double-clic pour modifier${classe.startsWith('fci-') ? ' · clic droit : relance FCI' : ''}">${valeur}</span>`;
    const lignes = [
      `<b>${lienDossier(d)}</b> ${boutonMenu(d)}`,
      champ('affect', 'affect', d.type ? `<span class="ty-${d.type}">${esc(typeParCode(d.type).libelle)}</span>` : '<span class="dim">—</span>'),
      champ('statut', 'statut', `<span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span>`),
      champ('FCI', 'fci', copieFci(d, esc(d.fci.join(', ') || 'aucun')), { retard: 'fci-retard', relance: 'fci-relance' }[etatFci(d, contexte().aujourdhui)] || ''),
      champ('commune', 'commune', esc(d.commune || '—')),
      champ('valo', 'valo', d.valorisation !== null && d.valorisation !== undefined ? esc(formaterMontant(d.valorisation)) : '—'),
      champ('date', 'date', d.dateAffectation ? esc(formater(d.dateAffectation)) : '—'),
      champ('relance', 'relance', d.dateRelance ? `<span class="${alerte || ''}">${esc(formater(d.dateRelance))}${alerte === 'retard' ? ' (en retard)' : alerte === 'proche' ? ' (proche)' : ''}</span>` : 'aucune'),
      champ('note', 'commentaire', esc(d.commentaire || '—').replace(/\n/g, '<br>' + ' '.repeat(10)))
    ];
    return `<pre class="fiche">${lignes.join('\n')}</pre>${carteLiesHtml(d)}${historiqueHtml(d)}`;
  }

  /**
   * L'historique d'un dossier, en carte : tout l'historique, du plus récent au plus ancien,
   * dans une liste qui défile dans la carte. Une étiquette par type (création, modification, mail, attachement).
   */
  // Cartes de la fiche (dossiers liés, historique) : fermées à chaque « open », ouvertes d'un clic ;
  // l'état est gardé quand la fiche se redessine (modification du dossier)
  const cartesOuvertes = new Set();
  racine.addEventListener('toggle', e => {
    const c = e.target?.dataset?.carte;
    if (c) e.target.open ? cartesOuvertes.add(c) : cartesOuvertes.delete(c);
  }, true);
  const ETIQUETTES = { creation: 'création', modification: 'modif', mail: 'mail', attachement: 'attach' };
  function historiqueHtml(d) {
    const entrees = [...d.historique].reverse();
    const lignes = entrees.map(h => {
      const quand = new Date(h.date);
      return `<li class="hi hi-${esc(h.action)}"><span class="hi-quand">`
        + `<span class="hi-date">${esc(quand.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }))}</span>`
        + `<span class="hi-heure dim">${esc(quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</span></span>`
        + `<span class="hi-quoi"><span class="hi-tag">${esc(ETIQUETTES[h.action] || h.action)}</span>${esc(h.detail)}</span></li>`;
    }).join('');
    return `<details class="histo" data-carte="histo"${cartesOuvertes.has('histo') ? ' open' : ''}><summary class="histo-tete">historique <span class="dim">· ${entrees.length}</span></summary>`
      + `<ol class="histo-corps${entrees.length > 6 ? ' defile' : ''}">${lignes || '<li class="dim">rien pour l\'instant</li>'}</ol></details>`;
  }

  /** La valeur d'un champ telle qu'on la retape (pour pré-remplir la saisie en place). */
  function valeurBrute(d, cle) {
    switch (cle) {
      case 'affect': return d.type ? motPourCode(MOTS_TYPE, d.type) : '-';
      case 'statut': return motPourCode(MOTS_STATUT, d.statutDft);
      case 'fci': return d.fci.join(' ');
      case 'commune': return d.commune || '';
      case 'valo': return d.valorisation !== null && d.valorisation !== undefined ? String(d.valorisation).replace('.', ',') : '';
      case 'date': return d.dateAffectation ? formater(d.dateAffectation) : '';
      case 'relance': return d.dateRelance ? formater(d.dateRelance) : '';
      case 'commentaire': return (d.commentaire || '').replace(/\n/g, ' ');
      default: return '';
    }
  }

  /**
   * Colonne RELANCE : un badge FCI et/ou DFT si cette relance a été préparée récemment,
   * c'est-à-dire tant que la protection anti-doublon est active (aujourd'hui ou hier).
   * Largeur fixe (8 caractères) pour garder l'alignement.
   */
  function relanceHtml(d) {
    // Dossier clos (mis à disposition, attach, annulé) : plus de relance à suivre, pas de badge
    if (statutParCode(d.statutDft)?.clos) return ' '.repeat(9);
    const jour = contexte().aujourdhui;
    const badge = motif => {
      // Le FCI est arrivé : la relance FCI n'a plus d'objet, le badge disparaît
      const r = motif === 'fci' && d.fci.length ? null : relanceRecente(d, motif, jour);
      if (!r) return '   ';
      const quand = `${r.jours === 0 ? "aujourd'hui" : 'hier'} à ${new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      return `<span class="badge badge-${motif}" title="relance ${motif.toUpperCase()} préparée ${quand} · une nouvelle relance demandera confirmation">${motif.toUpperCase()}</span>`;
    };
    return `${badge('fci')} ${badge('dft')}  `;
  }

  /**
   * Fiche : la carte des dossiers liés (même affaire dans le classeur partagé), du plus gros au plus
   * petit, avec une barre proportionnelle à la valo ; affect, statut (colonne E) et commentaire (J).
   */
  function carteLiesHtml(d) {
    const lies = lireLies(), liste = liesDe(d, lies);
    if (!liste.length) return '';
    const total = totalLies(d, lies), seuils = chaleurs(contexte().dossiers, lies);
    const max = Math.max(...liste.map(l => l.valo || 0), 1);
    const lignes = liste.map(l => `<li class="li">`
      + `<div class="li-haut"><span class="li-dossier" data-copie="${esc(l.dossier)}" title="clic droit : copier">${esc(l.dossier)}</span>`
      + `<span class="li-valo">${l.valo !== null ? esc(montantCourt(l.valo)) : '<span class="dim">sans valo</span>'}</span></div>`
      + `<div class="li-barre"><span style="width:${Math.round(((l.valo || 0) / max) * 100)}%"></span></div>`
      + `<div class="li-bas dim">${[l.affect, l.statut].filter(Boolean).map(esc).join(' · ') || '—'}${l.commentaire ? ` · <span title="${esc(l.commentaire)}">${esc(l.commentaire)}</span>` : ''}</div></li>`).join('');
    return `<details class="lies-carte ${chaleur(total, seuils)}" data-carte="lies"${cartesOuvertes.has('lies') ? ' open' : ''}><summary class="lies-tete">dossiers liés <span class="dim">· ${liste.length}</span><span class="lies-total">${esc(montantCourt(total))}</span></summary><ol class="lies-corps">${lignes}</ol></details>`;
  }

  /** Montant sans centimes : « 12 400 € » (colonne LIÉS). */
  const montantCourt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v).replace(/\s/g, ' ');

  /**
   * Colonne LIÉS : la valo totale des dossiers liés (même affaire dans le classeur partagé), en couleur
   * selon l'enjeu (top 10 % / top 30 % du registre). Survol : le détail ; clic : la fiche (carte des liés).
   */
  function liesHtml(d, lies, seuils) {
    const total = totalLies(d, lies);
    if (total === null) return `<span class="dim">${'·'.padStart(11)}</span>`;
    const detail = liesDe(d, lies).map(l => `${l.dossier} · ${l.valo !== null ? montantCourt(l.valo) : 'sans valo'}${l.statut ? ` · ${l.statut}` : ''}`).join('\n');
    return `<button type="button" class="lies ${chaleur(total, seuils)}" data-commande="open ${esc(d.gcblo)}" title="${esc(`${liesDe(d, lies).length} dossier(s) lié(s)\n${detail}`)}">${esc(montantCourt(total).padStart(11))}</button>`;
  }

  function tableauHtml(dossiers, tri = '') {
    const lies = lireLies(), seuils = chaleurs(contexte().dossiers, lies);
    const col = (t, n) => esc(String(t).padEnd(n).slice(0, n));
    const coupe = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
    const lignes = dossiers.map(d => {
      const fci = d.fci.length ? d.fci[0] + (d.fci.length > 1 ? `+${d.fci.length - 1}` : '') : '';
      const commune = d.commune || '';
      const valo = d.valorisation !== null && d.valorisation !== undefined ? formaterMontant(d.valorisation).replace(/\s/g, ' ') : '';
      // Chaque cellule est éditable au double-clic, comme dans la fiche (data-champ, data-dossier)
      const ed = (cle, html, classe = '') => `<span class="editable${classe ? ` ${classe}` : ''}" data-champ="${cle}" data-dossier="${esc(d.id)}" title="double-clic pour modifier${classe.startsWith('fci-') ? ' · clic droit : relance FCI' : ''}">${html}</span>`;
      // R13 : affecté depuis plus de 24 h et toujours sans FCI → la case FCI en rouge clair
      // (orange pendant 2 jours après une relance FCI)
      const fciRouge = { retard: 'fci-retard', relance: 'fci-relance' }[etatFci(d, contexte().aujourdhui)] || '';
      // Ordre des colonnes : AFFECT GCBLO COMMUNE VALO FCI STATUT DFT
      const milieu = `${ed('commune', col(coupe(commune, 22) || '—', 22))} ${ed('valo', `<span class="valo">${esc((valo || '—').padStart(11))}</span>`)} ${liesHtml(d, lies, seuils)}  ${ed('fci', copieFci(d, `<span class="dim">${col(fci || '—', 15)}</span>`), fciRouge)} `;
      // Une ligne = un bloc : le statut peut colorer toute la ligne (Attach : vert clair)
      return `<span class="rangee rangee-${d.statutDft}${choisis.has(d.id) ? ' choisie' : ''}" data-id="${esc(d.id)}">`
        // Date (d'affectation) : jour/mois seulement (l'année se voit en ouvrant le champ au double-clic)
        + `${ed('date', `<span class="dim">${col(d.dateAffectation ? formater(d.dateAffectation).slice(0, 5) : '—', 5)}</span>`)}  `
        + `${ed('affect', `<span class="ty-${d.type || 'SANS'}">${col(TYPE_COURT[d.type] || '—', 6)}</span>`)} `
        + `${lienDossier(d)} `
        + milieu
        + relanceHtml(d)
        + ed('statut', `<span class="st-${d.statutDft}">${col(STATUT_COURT[d.statutDft] || d.statutDft, 11)}</span>`)
        + boutonMenu(d) + '</span>';
    });
    // L'en-tête reste visible en haut de l'écran tant que la liste défile (CSS : sticky)
    // Chaque titre de colonne est cliquable : il relance la même liste triée sur cette colonne (▲ croissant, ▼ décroissant)
    const [triCol, triDesc] = [tri.replace(/-$/, ''), tri.endsWith('-')];
    const titre = (col, libelle, largeur, droite = false) => {
      const marque = triCol === col ? (triDesc ? '▼' : '▲') : '';
      const texte = droite ? `${marque}${marque ? ' ' : ''}${libelle}`.padStart(largeur) : `${libelle}${marque ? ' ' + marque : ''}`.padEnd(largeur);
      return `<button type="button" class="tri${marque ? ' trie' : ''}" data-tri="${col}" title="trier par ${libelle.toLowerCase()}">${esc(texte)}</button>`;
    };
    const entete = `<span class="entete dim">${titre('date', 'DATE', 7)}${titre('affect', 'AFFECT', 7)}${titre('gcblo', 'GCBLO', 17)}`
      + `${titre('commune', 'COMMUNE', 23)}${titre('valo', 'VALO', 11, true)} ${titre('lies', 'LIÉS', 11, true)}  ${titre('fci', 'FCI', 16)}${'RELANCE'.padEnd(9)}${titre('statut', 'STATUT DFT', 10)}</span>`;
    return `<pre class="tableau">${entete}${lignes.join('')}</pre>`;
  }

  const ecran = {
    ligne(html, classe = '') {
      const div = document.createElement('div');
      div.className = `l ${classe}`;
      div.innerHTML = html;
      sortie.appendChild(div);
      defiler();
      return div;
    },
    /**
     * Liste de dossiers, alignée (police à chasse fixe).
     * Le GCBLO est cliquable (→ « open ») ; ⋯ ouvre le menu d'actions du dossier.
     */
    tableau(dossiers) {
      // La vue retient la commande qui l'a produite (pour le tri par en-tête) et son tri éventuel
      const tri = (commandeEnCours.match(/(?:^|\s)tri:(\S+)/i) || [])[1] || '';
      ecran.ligne(tableauHtml(dossiers, tri.toLowerCase()), 'vue');
      Object.assign(sortie.lastElementChild.dataset, { liste: dossiers.map(d => d.id).join(','), ls: commandeEnCours, triActuel: tri.toLowerCase() });
    },
    fiche(d) {
      cartesOuvertes.clear();
      ecran.ligne(ficheHtml(d), 'vue vue-fiche');
      const el = sortie.lastElementChild;
      el.dataset.fiche = d.id;
    },
    /** Les listes et fiches déjà affichées ne sont plus à jour : on les grise. */
    /**
     * Un dossier a changé : les listes et fiches affichées se mettent à jour sur place
     * (même ordre, mêmes dossiers). Un dossier supprimé disparaît des listes ; sa fiche passe en grisé.
     */
    /** Une vue redessinée à chaque changement des dossiers (écran « Aujourd'hui »). dessiner() → HTML */
    vueVivante(dessiner) {
      ecran.ligne(dessiner(), 'vue');
      vivantes.set(sortie.lastElementChild, dessiner);
    },
    rafraichirVues() {
      const dossiers = contexte().dossiers, parId = new Map(dossiers.map(d => [d.id, d]));
      for (const [el, dessiner] of vivantes) { if (!el.isConnected) vivantes.delete(el); else el.innerHTML = dessiner(); }
      racine.querySelectorAll('.vue[data-liste]').forEach(vue => {
        if (vue.querySelector('.edition')) return;          // saisie en cours : on n'y touche pas
        vue.innerHTML = tableauHtml(vue.dataset.liste.split(',').map(i => parId.get(i)).filter(Boolean), vue.dataset.triActuel || '');
      });
      // Sélection : un dossier supprimé en sort
      if ([...choisis].some(i => !parId.has(i))) { [...choisis].forEach(i => { if (!parId.has(i)) choisis.delete(i); }); majSelection(); }
      racine.querySelectorAll('.vue[data-fiche]').forEach(vue => {
        if (vue.querySelector('.edition')) return;
        const d = parId.get(vue.dataset.fiche);
        if (d) { vue.innerHTML = ficheHtml(d); vue.classList.remove('perime'); } else vue.classList.add('perime');
      });
    },
    vider() { ecranEl.innerHTML = ''; if (voletEl) voletEl.innerHTML = ''; viderSelection(); },
    /** Écrit une ligne dans le volet de droite (messages qui ne viennent pas d'une commande : sauvegarde automatique…). */
    /**
     * Les événements automatiques (sauvegarde, classeur partagé…) : une notification discrète en bas
     * de la console, qui disparaît seule après quelques secondes. Une erreur, ou un message qui attend
     * un clic (bouton), reste jusqu'à ce qu'on la ferme. Le volet ne garde que ce qu'on a demandé.
     */
    journal(html, classe = '') {
      let pile = racine.querySelector('.notifs');
      if (!pile) { pile = document.createElement('div'); pile.className = 'notifs'; pile.setAttribute('aria-live', 'polite'); racine.body.appendChild(pile); }
      const n = document.createElement('div');
      n.className = `notif ${classe}`;
      n.innerHTML = `<span class="notif-texte">${html}</span><button type="button" class="notif-fermer" aria-label="Fermer">✕</button>`;
      n.querySelector('.notif-fermer').addEventListener('click', () => n.remove());
      n.addEventListener('click', e => { if (e.target.closest('[data-commande]')) setTimeout(() => n.remove(), 0); });
      pile.appendChild(n);
      while (pile.children.length > 4) pile.firstElementChild.remove();
      if (classe !== 'err' && !n.querySelector('[data-commande]')) setTimeout(() => { n.classList.add('part'); setTimeout(() => n.remove(), 400); }, 6000);
    }
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
  async function lancer(texte, { historique: noter = true } = {}) {
    if (attente) return;
    fermerMenu();
    // Une commande lancée : un jeu en cours (morpion) disparaît
    racine.querySelectorAll('.l.jeu').forEach(j => { j.arreter?.(); j.remove(); });
    let analyse = analyser(texte, texte.length, contexte());
    // GCBLO collé (ou tapé) sans commande : un seul dossier reconnu → open, sinon → ls (liste collée)
    if (!analyse.commande && /[A-Za-z]{3}\s*[-‐‑‒–—]?\s*\d{6}|(?:^|\s)\d{6}(?:\s|$)/.test(texte)) {
      const ouvrir = `open ${texte.trim()}`;
      const a = texte.trim().split(/\s+/).length === 1 && analyser(ouvrir, ouvrir.length, contexte());
      texte = a?.commande && a.complet ? ouvrir : `ls ${texte.trim()}`;
      analyse = analyser(texte, texte.length, contexte());
    }
    const id = analyse.commande?.id;
    let echoDansLeVolet = false;
    // Commande inconnue ou incomplète : le message d'erreur va aussi dans le volet (la console ne bouge pas)
    if (voletEl && (DANS_LE_VOLET.has(id) || !analyse.commande || !analyse.complet)) sortie = voletEl;
    // open : le volet repart de zéro, la fiche y tient entière sans défiler
    if (voletEl && id === 'open' && analyse.complet) voletEl.innerHTML = '';
    if (voletEl && VIDE_LA_CONSOLE.has(id) && analyse.complet) {
      // ls (list) et info : la commande s'écrit dans le volet, comme les autres ;
      // la console est vidée et ne montre que la liste. Sans résultat, tout va dans le volet
      // et la liste déjà affichée reste en place.
      echoDansLeVolet = true;
      if (aucunResultat(analyse)) sortie = voletEl; else { ecranEl.innerHTML = ''; viderSelection(); }
    }
    try { await lancerDans(texte, analyse, echoDansLeVolet, noter); } finally { sortie = ecranEl; }
  }

  /** ls ou info ne trouveraient aucun dossier ? */
  function aucunResultat(analyse) {
    const ctx = contexte();
    if (analyse.commande.id === 'ls') return !resultatLs(criteresListe(analyse.valeurs), ctx.regles, ctx.dossiers).liste.length;
    return false;
  }

  async function lancerDans(texte, analyse, echoDansLeVolet = false, noter = true) {
    const ici = sortie;
    // Commande cachée : pas d'écho, pas d'historique
    const cachee = !!analyse.commande?.cachee;
    if (echoDansLeVolet) sortie = voletEl;
    if (!cachee) ecran.ligne(`<span class="invite-echo">${INVITE}</span> ${colorer(texte, analyse)}`, 'echo');
    sortie = ici;
    if (noter && !cachee) {
      historique = [texte, ...historique.filter(h => h !== texte)].slice(0, 100);
      try { localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(historique)); } catch { /* facultatif */ }
    }
    posHistorique = -1;
    rafraichir();

    if (!analyse.commande) return ecran.ligne(`gcblo: ${esc(analyse.erreurs[0] || `${texte.split(/\s+/)[0]} : commande introuvable`)}`, 'err');
    if (!analyse.complet) {
      const pb = analyse.erreurs[0] || analyse.erreurCourante || `il manque : ${analyse.manquants.join(', ')}`;
      return ecran.ligne(`${esc(analyse.commande.verbes[0])}: ${esc(pb)}<br><span class="dim">usage : ${esc(analyse.commande.forme)}</span>`, 'err');
    }
    if (!analyse.commande.cachee) contexte().memoriser?.(analyse.commande.id);
    commandeEnCours = texte;
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
      // Dans l'historique (↑ déjà utilisé, rien tapé depuis) : ↑ ↓ continuent dans l'historique,
      // la liste de propositions reste fermée. Sinon ↑ ↓ choisissent une proposition.
      if (ouvert && posHistorique < 0 && (champ.value.trim() || etat.choisi >= 0)) {
        etat.choisi = (etat.choisi + delta + n) % n; dessinerPropositions();
      } else if (historique.length) {
        posHistorique = Math.max(-1, Math.min(historique.length - 1, posHistorique - delta));
        champ.value = posHistorique >= 0 ? historique[posHistorique] : '';
        champ.setSelectionRange(champ.value.length, champ.value.length);
        const garde = posHistorique; rafraichir(); posHistorique = garde;
        listeEl.hidden = true; etat.choisi = -1;
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

  /* ---------------- Repère visuel : ce qu'on vient de cliquer (gauche ou droit) est surligné en bleu clair ---------------- */
  // Le morceau le plus précis sous la souris : une case de liste ou de fiche, un lien, un morceau
  // du tableau de bord ; à défaut le mot (span) cliqué, puis la ligne entière. Un seul repère à la fois.
  const ZONES_REPERE = '#ecran, #volet, #tableauBord';
  const PRECIS = '.editable, .lien, .points, .m, .entete';
  let repere = null, repereCle = null, repereLigne = null;
  /** La ligne qui contient le repère, surlignée très légèrement en gris (ligne de liste, de message, du tableau de bord). */
  function poserLigne(el) {
    const ligne = el?.closest('.rangee, .bl, .l:not(.vue)') || null;
    if (ligne === repereLigne) return;
    repereLigne?.classList.remove('repere-ligne');
    repereLigne = ligne;
    ligne?.classList.add('repere-ligne');
  }
  /** De quoi retrouver l'élément quand la vue est redessinée (liste mise à jour, tableau de bord…). */
  function cleRepere(el) {
    const zone = el.closest(ZONES_REPERE);
    const sel = v => CSS.escape(v);
    if (el.dataset.champ && el.dataset.dossier) return `#${zone.id} [data-champ="${sel(el.dataset.champ)}"][data-dossier="${sel(el.dataset.dossier)}"]`;
    const fiche = el.closest('.vue[data-fiche]');
    if (el.dataset.champ && fiche) return `#${zone.id} .vue[data-fiche="${sel(fiche.dataset.fiche)}"] [data-champ="${sel(el.dataset.champ)}"]`;
    if (el.dataset.commande) return `#${zone.id} [data-commande="${sel(el.dataset.commande)}"]`;
    return null;
  }
  function poserRepere(el) {
    if (repere === el) return;
    repere?.classList.remove('repere');
    repere = el;
    repereCle = el ? cleRepere(el) : null;
    el?.classList.add('repere');
    poserLigne(el);
  }
  // Vue redessinée : le repère revient sur le même élément s'il existe encore
  new MutationObserver(() => {
    if (!repere || repere.isConnected || !repereCle) return;
    const el = racine.querySelector(repereCle);
    repere = el; if (el) el.classList.add('repere'); else repereCle = null;
    repereLigne = null; poserLigne(el);
  }).observe(racine.body, { childList: true, subtree: true });
  racine.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 2) return;
    const t = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!t?.closest(ZONES_REPERE) || t.closest('.edition')) return;
    const el = t.closest(PRECIS)
      || (t.matches('span, b, i, button') && !t.closest('.cadre') ? t : null)
      || t.closest('.rangee, .l, .bl');
    poserRepere(el && !el.matches(ZONES_REPERE) ? el : null);
  }, true);

  // Cartes « Aujourd'hui » : l'ombre du bas disparaît quand on arrive au bout de la liste
  racine.addEventListener('scroll', e => {
    const c = e.target;
    if (c instanceof Element && c.classList.contains('defile')) c.classList.toggle('fin', c.scrollTop + c.clientHeight >= c.scrollHeight - 2);
  }, true);

  /* ---------------- Sélection multiple : Ctrl+clic (un par un), Maj+clic (une plage) ---------------- */
  // Une barre d'actions apparaît au-dessus de la ligne de saisie ; chaque bouton lance une commande
  // ordinaire sur les dossiers choisis (set, attachement, delete) : un clic = une commande.
  const barreEl = document.createElement('div');
  barreEl.className = 'selection'; barreEl.hidden = true;
  $('#formulaire')?.before(barreEl);
  const gcbloChoisis = () => { const parId = new Map(contexte().dossiers.map(d => [d.id, d])); return [...choisis].map(i => parId.get(i)?.gcblo).filter(Boolean); };
  function majSelection() {
    racine.querySelectorAll('#ecran .rangee[data-id]').forEach(r => r.classList.toggle('choisie', choisis.has(r.dataset.id)));
    const n = gcbloChoisis().length;
    barreEl.hidden = !n;
    if (!n) return;
    const options = (titre, mots) => `<optgroup label="${titre}">${mots.map(([mot, lib]) => `<option value="${esc(mot)}">${esc(lib)}</option>`).join('')}</optgroup>`;
    barreEl.innerHTML = `<span class="sel-n">${n} sélectionné${n > 1 ? 's' : ''}</span>`
      + `<select data-sel="set" aria-label="Changer le statut ou l'affect"><option value="">statut / affect…</option>`
      + options('statut DFT', STATUTS.map(s => [motPourCode(MOTS_STATUT, s.code), s.libelle]))
      + options('affect', ['NUM21', 'AIR', 'SOGETREL'].map(c => [motPourCode(MOTS_TYPE, c), typeParCode(c).libelle])) + '</select>'
      + '<button type="button" data-sel="attachement">attachement</button>'
      + '<button type="button" data-sel="copier" title="copie les GCBLO, un par ligne (à coller dans Excel)">copier</button>'
      + '<button type="button" data-sel="delete" class="sel-danger">supprimer</button>'
      + '<button type="button" data-sel="vider" class="sel-fermer" title="désélectionner (Échap)">✕</button>';
  }
  function viderSelection() { if (!choisis.size) return; choisis.clear(); dernierChoisi = null; majSelection(); }
  barreEl.addEventListener('change', e => {
    const sel = e.target.closest('[data-sel="set"]');
    if (sel?.value) { const v = sel.value; sel.value = ''; lancer(`set ${gcbloChoisis().join(' ')} to ${v}`); }
  });
  barreEl.addEventListener('click', async e => {
    const b = e.target.closest('button[data-sel]');
    if (!b) return;
    const g = gcbloChoisis();
    if (b.dataset.sel === 'vider') viderSelection();
    else if (b.dataset.sel === 'copier') { if (await copier(g.join('\n'))) bulle(e.clientX, e.clientY, `${g.length} GCBLO copiés`); }
    else await lancer(`${b.dataset.sel} ${g.join(' ')}`);
    champ.focus();
  });
  // Maj+clic : pas de sélection de texte du navigateur sur la liste
  racine.addEventListener('mousedown', e => { if (e.shiftKey && e.target.closest?.('#ecran .rangee[data-id]')) e.preventDefault(); });
  function choisirRangee(rangee, plage) {
    const id = rangee.dataset.id;
    if (plage && dernierChoisi) {
      const rangees = [...rangee.closest('.vue').querySelectorAll('.rangee[data-id]')].map(r => r.dataset.id);
      const [a, b] = [rangees.indexOf(dernierChoisi), rangees.indexOf(id)].sort((x, y) => x - y);
      if (a >= 0) rangees.slice(a, b + 1).forEach(i => choisis.add(i));
      else choisis.add(id);
    } else if (choisis.has(id)) choisis.delete(id);
    else choisis.add(id);
    dernierChoisi = id;
    majSelection();
  }

  racine.addEventListener('click', e => {
    const rangee = (e.ctrlKey || e.metaKey || e.shiftKey) && e.target.closest('#ecran .rangee[data-id]');
    if (rangee) { e.preventDefault(); choisirRangee(rangee, e.shiftKey); return; }
    // En-tête de liste : relance la même commande triée sur cette colonne (2e clic : sens inverse)
    const tri = e.target.closest('.entete [data-tri]');
    if (tri) {
      e.preventDefault();
      const vue = tri.closest('.vue'), col = tri.dataset.tri;
      const base = (vue?.dataset.ls || 'ls').replace(/\s+tri:\S+/gi, '').trim();
      lancer(`${base} tri:${col}${vue?.dataset.triActuel === col ? '-' : ''}`);
      return;
    }
    const cmd = e.target.closest('[data-commande]');
    const points = e.target.closest('[data-menu-dossier]');
    if (cmd) { e.preventDefault(); lancer(cmd.dataset.commande); return; }
    if (points) { e.preventDefault(); menuEl && points.getAttribute('aria-expanded') === 'true' ? fermerMenu() : ouvrirMenu(points, points.dataset.menuDossier); return; }
    if (menuEl && !e.target.closest('.menu')) fermerMenu();
    // Clic ailleurs dans l'écran : on revient à la saisie
    if (e.target.closest('#ecran, #volet') && !e.target.closest('.edition, .editable') && !getSelection().toString()) champ.focus();
  });
  /* ---------------- Fiche : double-clic sur un champ pour le modifier ---------------- */

  /* ---------------- Clic droit sur un GCBLO ou un FCI : copie dans le presse-papiers ---------------- */

  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); return true; } catch { /* navigateur réticent : méthode ancienne */ }
    const zone = document.createElement('textarea');
    zone.value = texte; zone.style.position = 'fixed'; zone.style.opacity = '0';
    document.body.appendChild(zone); zone.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* rien */ }
    zone.remove();
    return ok;
  }
  /** Petite bulle « copié » près du curseur, qui disparaît seule. */
  function bulle(x, y, texte) {
    const b = document.createElement('div');
    b.className = 'bulle-copie'; b.textContent = texte;
    b.style.left = `${Math.min(x + 12, innerWidth - 260)}px`; b.style.top = `${Math.max(4, y - 30)}px`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }
  racine.addEventListener('contextmenu', async e => {
    // R13 : clic droit sur une case FCI rouge (FCI attendu depuis plus de 24 h) → « relance ‹gcblo› fci »
    const rouge = e.target.closest('.fci-retard, .fci-relance');
    if (rouge && !rouge.querySelector('.edition')) {
      e.preventDefault();
      const id = rouge.dataset.dossier || rouge.closest('[data-fiche]')?.dataset.fiche;
      const d = contexte().dossiers.find(x => x.id === id);
      if (d) lancer(`relance ${d.gcblo} fci`);
      return;
    }
    const cible = e.target.closest('[data-copie]');
    if (!cible || cible.querySelector('.edition')) return;
    e.preventDefault();
    const texte = cible.dataset.copie;
    bulle(e.clientX, e.clientY, (await copier(texte)) ? `copié : ${texte}` : 'copie impossible');
  });

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
    const choix = cle === 'affect' ? [...Object.keys(MOTS_TYPE), '-'] : cle === 'statut' ? STATUTS.map(st => motPourCode(MOTS_STATUT, st.code)) : null;
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
    // Échap, ligne de saisie vide : on désélectionne
    if (e.key === 'Escape' && !menuEl && choisis.size && !champ.value && !attente) { e.preventDefault(); viderSelection(); return; }
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
    /** Les dossiers de la dernière liste affichée dans la console (pour « * »), dans l'ordre affiché. */
    listeAffichee() {
      const vues = ecranEl.querySelectorAll('.vue[data-liste]');
      const vue = vues[vues.length - 1];
      if (!vue?.dataset.liste) return [];
      const parId = new Map(contexte().dossiers.map(d => [d.id, d]));
      return vue.dataset.liste.split(',').map(i => parId.get(i)).filter(Boolean);
    },
    /** Lance une commande comme si elle avait été tapée (utilisé par les clics). */
    lancer,
    focus: () => champ.focus()
  };
}
