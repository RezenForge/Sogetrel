/**
 * reglages.js — les réglages de l'utilisateur (pas des règles métier).
 *
 * Le destinataire des emails de relance pour chaque type (NUM21, AIR,
 * Sogetrel), et les villes consultées en météo (pour les proposer). Ils sont enregistrés dans le navigateur, à part
 * des dossiers. Le support est interchangeable, comme pour le store.
 */
import { TYPES } from './config.js';

const CLE = 'gcblo.v2.reglages';

/** Adresse email plausible (on ne cherche pas à tout valider : Outlook le fera). */
export const estEmail = texte => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(String(texte ?? ''));

export function supportReglagesNavigateur(cle = CLE) {
  return {
    lire() { try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; } },
    ecrire(d) { try { localStorage.setItem(cle, JSON.stringify(d)); return true; } catch { return false; } }
  };
}

export function creerReglages(support = supportReglagesNavigateur()) {
  const vide = Object.fromEntries(TYPES.map(t => [t.code, '']));
  const lu = support.lire() || {};
  let reglages = { destinataires: { ...vide, ...(lu.destinataires || {}) }, villes: Array.isArray(lu.villes) ? lu.villes : [] };

  return {
    /** Le destinataire d'un type ('' s'il n'est pas réglé). */
    destinataire: type => reglages.destinataires[type] || '',
    /** Tous les destinataires, par code de type. */
    destinataires: () => ({ ...reglages.destinataires }),
    /** Règle (ou efface, avec '') le destinataire d'un type. */
    definirDestinataire(type, adresse) {
      if (!(type in reglages.destinataires)) return { ok: false, erreur: `type inconnu : ${type}` };
      if (adresse && !estEmail(adresse)) return { ok: false, erreur: `« ${adresse} » n'est pas une adresse email` };
      reglages = { ...reglages, destinataires: { ...reglages.destinataires, [type]: adresse || '' } };
      return { ok: support.ecrire(reglages) };
    },
    /** Les villes consultées récemment (météo), la plus récente d'abord. */
    villes: () => [...reglages.villes],
    noterVille(nom) {
      const v = String(nom).trim().toLowerCase();
      reglages = { ...reglages, villes: [v, ...reglages.villes.filter(x => x !== v)].slice(0, 8) };
      support.ecrire(reglages);
    }
  };
}
