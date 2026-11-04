/**
 * aujourdhui.js — l'écran « Aujourd'hui » (commande `today`, affiché à l'ouverture) :
 * ce qui demande une action, en une liste de lignes cliquables. Un clic = la commande `ls` qui
 * montre les dossiers concernés.
 *
 * Fonction pure : on lui donne les statistiques (dossiers.js) et le nombre d'écarts d'affect.
 *   pointDuJour(stats, { ecartsAffect }) → [{ n, libelle, commande, classe, conseil }]
 *   (seulement les lignes à traiter : n > 0, dans l'ordre d'urgence)
 */
export function pointDuJour(s, { ecartsAffect = 0 } = {}) {
  const lignes = [
    { n: s.fciRetard || 0, libelle: 'FCI attendus depuis plus de 24 h', commande: 'ls fci-retard', classe: 'retard', conseil: 'clic droit sur la case rouge = relance' },
    { n: s.retard || 0, libelle: 'relances en retard', commande: 'ls retard', classe: 'retard', conseil: '⋯ → relance DFT' },
    { n: s.parStatut?.LITIGE || 0, libelle: 'dossiers en litige', commande: 'ls litige', classe: 'st-LITIGE' },
    { n: s.parStatut?.REFUSE || 0, libelle: 'dossiers refusés à reprendre', commande: 'ls refuse', classe: 'st-REFUSE' },
    { n: ecartsAffect, libelle: 'affects différents de la colonne I', commande: 'ls ecart-affect', classe: 'proche', conseil: 'double-clic sur l\'affect pour corriger' },
    { n: s.parType?.SANS || 0, libelle: 'dossiers sans affect', commande: 'ls sans-affect', classe: 'proche', conseil: '⋯ → affecter (mail)' },
    { n: s.proche || 0, libelle: 'relances dans les 3 jours', commande: 'ls proches', classe: 'proche' }
  ];
  return lignes.filter(l => l.n > 0);
}
