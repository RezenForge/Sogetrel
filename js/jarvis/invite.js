/**
 * invite.js — l'écran du terminal : la zone de sortie et la ligne de saisie.
 *
 * À chaque touche :  analyser() → proposer() + apercu() → affichage
 *   - les mots sont colorés selon leur rôle (calque « miroir » derrière le champ),
 *   - la meilleure proposition s'affiche en grisé après le curseur (texte fantôme),
 *   - la liste des propositions s'ouvre au-dessus de la ligne,
 *   - une ligne d'aide dessous montre l'aperçu ou l'erreur.
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

const CLE_HISTORIQUE = 'gcblo.v2.historique';

export function creerInvite({ racine, contexte }) {
  const $ = sel => racine.querySelector(sel);
  const ecranEl = $('#ecran'), champ = $('#saisie'), miroir = $('#miroir'), listeEl = $('#propositions'), aideEl = $('#aideLigne'), inviteEl = $('#invite');

  let etat = { analyse: null, prop: { propositions: [] }, choisi: -1 };
  let historique = [];
  try { historique = JSON.parse(localStorage.getItem(CLE_HISTORIQUE)) || []; } catch { /* historique facultatif */ }
  let posHistorique = -1;
  let attente = null;            // question oui/non en cours : { resoudre }
  let executer = async () => {};

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
    /** Un tableau aligné (police à chasse fixe) ; il défile horizontalement sur petit écran. */
    tableau(dossiers) {
      const col = (t, n) => esc(String(t).padEnd(n).slice(0, n));
      const lignes = dossiers.map(d => {
        const alerte = contexte().regles.etatRelance(d);
        const fci = d.fci.length ? d.fci[0] + (d.fci.length > 1 ? `+${d.fci.length - 1}` : '') : '—';
        const relance = d.dateRelance ? formater(d.dateRelance).slice(0, 8) + (alerte === 'retard' ? ' !' : alerte === 'proche' ? ' ·' : '') : '—';
        return `<span class="ty-${d.type}">${col(typeParCode(d.type).libelle, 9)}</span>`
          + `<span class="c-dossier">${col(d.gcblo, 18)}</span>`
          + `<span class="dim">${col(fci, 16)}</span>`
          + `<span class="dim">${col(formater(d.dateAffectation).slice(0, 8), 10)}</span>`
          + `<span class="${alerte || 'dim'}">${col(relance, 11)}</span>`
          + `<span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span>`;
      });
      const entete = `<span class="dim">${'TYPE'.padEnd(9)}${'GCBLO'.padEnd(18)}${'FCI'.padEnd(16)}${'AFFECT.'.padEnd(10)}${'RELANCE'.padEnd(11)}STATUT DFT</span>`;
      ecran.ligne(`<pre class="tableau">${[entete, ...lignes].join('\n')}</pre>`);
    },
    fiche(d) {
      const regles = contexte().regles;
      const alerte = regles.etatRelance(d);
      const champ = (nom, valeur) => `<span class="dim">${esc(nom.padEnd(14))}</span>${valeur}`;
      const lignes = [
        `<span class="c-dossier"><b>${esc(d.gcblo)}</b></span>`,
        champ('type', `<span class="ty-${d.type}">${esc(typeParCode(d.type).libelle)}</span>`),
        champ('statut DFT', `<span class="st-${d.statutDft}">${esc(statutParCode(d.statutDft).libelle)}</span>`),
        champ('FCI', esc(d.fci.join(', ') || 'aucun')),
        champ('affectation', esc(formater(d.dateAffectation))),
        champ('relance', d.dateRelance ? `<span class="${alerte || ''}">${esc(formater(d.dateRelance))}${alerte === 'retard' ? ' (en retard)' : alerte === 'proche' ? ' (proche)' : ''}</span>` : 'aucune'),
        champ('commentaire', esc(d.commentaire || '—').replace(/\n/g, '<br>' + ' '.repeat(14))),
        `<span class="dim">historique</span>`,
        ...[...d.historique].reverse().slice(0, 8).map(h => `  <span class="dim">${esc(new Date(h.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>  ${esc(h.detail)}`)
      ];
      ecran.ligne(`<pre class="fiche">${lignes.join('\n')}</pre>`);
    },
    vider() { ecranEl.innerHTML = ''; }
  };

  /* ---------------- Ligne de saisie ---------------- */

  /** Recalcule tout à partir du texte et du curseur, puis redessine. */
  function rafraichir() {
    // Pendant une question oui/non : on affiche juste ce qui est tapé, sans analyse
    if (attente) { miroir.innerHTML = esc(champ.value); return; }
    const texte = champ.value, curseur = champ.selectionStart ?? texte.length;
    const ctx = contexte();
    const analyse = analyser(texte, curseur, ctx);
    const prop = texte.trim() || document.activeElement === champ ? proposer(analyse, ctx) : { propositions: [] };
    etat = { analyse, prop, choisi: -1 };
    // Couleurs + texte fantôme (affiché seulement si le curseur est en fin de ligne)
    const fantome = curseur === texte.length ? prop.fantome : '';
    miroir.innerHTML = colorer(texte, analyse) + (fantome ? `<span class="fantome">${esc(fantome)}</span>` : '');
    synchroniserDefilement();
    dessinerPropositions();
    // Ligne d'aide : erreur sur le mot courant, sinon erreur, sinon aperçu
    const msg = analyse.erreurs[0] || (texte.trim() && analyse.erreurCourante && curseur < texte.length ? analyse.erreurCourante : null);
    aideEl.className = `aide-ligne ${msg ? 'err' : ''}`;
    aideEl.textContent = msg ? `✗ ${msg}` : (texte.trim() ? apercu(analyse, ctx) || '' : 'tapez une commande, ou « aide »');
  }

  function synchroniserDefilement() { miroir.style.transform = `translateX(${-champ.scrollLeft}px)`; }

  function dessinerPropositions() {
    const { propositions } = etat.prop;
    listeEl.hidden = !propositions.length || attente !== null;
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
      const oui = /^(o|oui|y|yes)$/i.test(texte);
      const r = attente; attente = null;
      ecran.ligne(`<span class="dim">${esc(inviteEl.textContent)}</span> ${esc(texte || 'non')}`, 'echo');
      remettreInvite(); champ.value = '';
      r.resoudre(oui);
      rafraichir();
      return;
    }
    if (!texte) return;
    const analyse = analyser(texte, texte.length, contexte());
    ecran.ligne(`<span class="invite-echo">gcblo:~$</span> ${colorer(texte, analyse)}`, 'echo');
    historique = [texte, ...historique.filter(h => h !== texte)].slice(0, 100);
    try { localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(historique)); } catch { /* facultatif */ }
    posHistorique = -1;
    champ.value = '';
    rafraichir();

    if (!analyse.commande) return ecran.ligne(`✗ ${esc(analyse.erreurs[0] || `commande inconnue : « ${texte.split(/\s+/)[0]} »`)} · tapez <span class="c-verbe">aide</span>`, 'err');
    if (!analyse.complet) {
      const pb = analyse.erreurs[0] || analyse.erreurCourante || `il manque : ${analyse.manquants.join(', ')}`;
      return ecran.ligne(`✗ ${esc(pb)}<br><span class="dim">forme : ${esc(analyse.commande.forme)}</span>`, 'err');
    }
    contexte().memoriser?.(analyse.commande.id);
    await executer(analyse);
    rafraichir();
  }

  function remettreInvite() { inviteEl.textContent = 'gcblo:~$'; inviteEl.classList.remove('question'); }

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
      // Tab insère la proposition sélectionnée, ou la meilleure (↑ ↓ servent à choisir)
      if (ouvert) accepter(etat.choisi >= 0 ? etat.choisi : 0);
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
      if (ouvert && etat.choisi >= 0) accepter(etat.choisi); else valider();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (ouvert) { listeEl.hidden = true; etat.choisi = -1; } else { champ.value = ''; rafraichir(); }
    }
  });
  listeEl.addEventListener('mousedown', e => e.preventDefault());       // garder le focus dans le champ
  listeEl.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) accepter(Number(li.dataset.i)); champ.focus(); });
  racine.querySelector('#ecran').addEventListener('click', () => { if (!getSelection().toString()) champ.focus(); });

  return {
    ecran,
    brancher(fn) { executer = fn; },
    /** Pose une question oui/non dans l'invite elle-même. */
    confirmer(question) {
      return new Promise(resoudre => {
        attente = { resoudre };
        inviteEl.textContent = `${question} [o/n]`;
        inviteEl.classList.add('question');
        listeEl.hidden = true; miroir.innerHTML = ''; aideEl.textContent = 'o = oui · n ou Entrée = non';
        champ.value = ''; champ.focus();
      });
    },
    rafraichir,
    focus: () => champ.focus()
  };
}
