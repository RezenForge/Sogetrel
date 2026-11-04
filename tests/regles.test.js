/**
 * regles.test.js — tests des règles métier (étape 1).
 *
 * Chaque test part d'un store vide en mémoire et d'une horloge fixée au
 * lundi 2 novembre 2026, 10 h : les résultats ne dépendent ni du jour où l'on
 * lance les tests, ni du navigateur.
 */
import { groupe, test, egal, vrai } from './outil.js';
import { creerStore, supportMemoire } from '../js/store.js';
import { creerDossiers, lireFci, normaliserGcblo, lireMontant, formaterMontant } from '../js/dossiers.js';
import { ajouterJours, ecartJours, estJour, formater, versJour } from '../js/dates.js';

const MAINTENANT = new Date(2026, 10, 2, 10, 0);       // 02/11/2026 10:00, heure locale
const AUJOURDHUI = '2026-11-02';

/** Un environnement neuf pour chaque test. */
function environnement(depart = null) {
  const support = supportMemoire(depart);
  const store = creerStore(support);
  const regles = creerDossiers(store, { horloge: () => MAINTENANT });
  return { store, regles, support };
}
const saisie = (plus = {}) => ({ type: 'AIR', gcblo: 'SBA501404-THF010', fci: 'F26154200726', ...plus });

/* -------------------------------------------------------------------------- */
groupe('Dates', () => {
  test('versJour donne AAAA-MM-JJ en heure locale', () => egal(versJour(MAINTENANT), AUJOURDHUI));
  test('ajouterJours traverse les mois', () => egal(ajouterJours('2026-10-30', 3), '2026-11-02'));
  test('ajouterJours traverse le changement d\'heure', () => egal(ajouterJours('2026-10-24', 2), '2026-10-26'));
  test('ecartJours : futur positif, passé négatif', () => { egal(ecartJours('2026-11-05', AUJOURDHUI), 3); egal(ecartJours('2026-10-31', AUJOURDHUI), -2); });
  test('estJour refuse une date qui n\'existe pas', () => { vrai(estJour('2026-02-28')); vrai(!estJour('2026-02-31')); vrai(!estJour('02/11/2026')); });
  test('formater affiche JJ/MM/AAAA', () => egal(formater('2026-11-02'), '02/11/2026'));
});

/* -------------------------------------------------------------------------- */
groupe('Lecture des saisies', () => {
  test('GCBLO mis en majuscules, espaces retirés', () => egal(normaliserGcblo(' sba501404-thf010 '), 'SBA501404-THF010'));
  test('FCI : plusieurs séparateurs acceptés', () => egal(lireFci('F09069260926 et f09073260926, F09069260926').fci, ['F09069260926', 'F09073260926']));
  test('FCI : « aucun », « ? » ou vide = pas de FCI', () => { egal(lireFci('aucun').fci, []); egal(lireFci('?').fci, []); egal(lireFci('').fci, []); });
  test('FCI : morceau invalide signalé', () => egal(lireFci('F123 F26154200726').invalides, ['F123']));
});

/* -------------------------------------------------------------------------- */
groupe('Création et validation', () => {
  test('crée un dossier avec les valeurs par défaut', () => {
    const { regles } = environnement();
    const r = regles.creer(saisie());
    vrai(r.ok, 'création refusée');
    egal(r.dossier.statutDft, 'A_FAIRE', 'statut par défaut');
    egal(r.dossier.dateAffectation, AUJOURDHUI, 'affectation par défaut');
    egal(r.dossier.dateRelance, null, 'pas de relance par défaut');
    egal(r.dossier.fci, ['F26154200726']);
  });
  test('l\'affect peut manquer (import, commande affect) ; un affect inconnu est refusé', () => {
    const e = environnement();
    const r = e.regles.creer(saisie({ type: '' }));
    vrai(r.ok); egal(r.dossier.type, null);
    vrai(e.regles.creer(saisie({ type: 'XYZ', gcblo: 'SBA501405-THF010' })).erreurs.type);
  });
  test('le format du GCBLO est vérifié', () => {
    const r = environnement().regles.creer(saisie({ gcblo: 'SBA5014-THF010' }));
    vrai(!r.ok); vrai(r.erreurs.gcblo.includes('Format'));
  });
  test('un FCI mal formé est refusé', () => {
    const r = environnement().regles.creer(saisie({ fci: 'F2615' }));
    vrai(!r.ok); vrai(r.erreurs.fci);
  });
  test('un statut inconnu est refusé', () => {
    const r = environnement().regles.creer(saisie({ statutDft: 'TERMINE' }));
    vrai(!r.ok); vrai(r.erreurs.statutDft);
  });
  test('une date impossible est refusée', () => {
    const r = environnement().regles.creer(saisie({ dateRelance: '2026-02-31' }));
    vrai(!r.ok); vrai(r.erreurs.dateRelance);
  });
  test('les dossiers enregistrés sont gelés (non modifiables sur place)', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    vrai(Object.isFrozen(d) && Object.isFrozen(d.fci) && Object.isFrozen(d.historique));
  });
});

/* -------------------------------------------------------------------------- */
groupe('R1 — Doublons', () => {
  test('refuse un GCBLO déjà présent, même avec un autre type', () => {
    const { regles } = environnement();
    regles.creer(saisie({ type: 'AIR' }));
    const r = regles.creer(saisie({ type: 'NUM21' }));
    vrai(!r.ok); vrai(r.erreurs.gcblo.includes('existe déjà'));
  });
  test('la casse ne permet pas de contourner', () => {
    const { regles } = environnement();
    regles.creer(saisie());
    vrai(!regles.creer(saisie({ gcblo: 'sba501404-thf010' })).ok);
  });
  test('modifier un dossier ne le compte pas comme son propre doublon', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    vrai(regles.modifier(d.id, { commentaire: 'ok' }).ok);
  });
});

/* -------------------------------------------------------------------------- */
groupe('R2 / R3 — Alertes de relance', () => {
  const avecRelance = (dateRelance, statutDft = 'A_FAIRE') => {
    const { regles } = environnement();
    return regles.etatRelance(regles.creer(saisie({ dateRelance, statutDft })).dossier);
  };
  test('relance passée → retard', () => egal(avecRelance('2026-11-01'), 'retard'));
  test('relance aujourd\'hui → proche', () => egal(avecRelance(AUJOURDHUI), 'proche'));
  test('relance dans 3 jours → proche', () => egal(avecRelance('2026-11-05'), 'proche'));
  test('relance dans 4 jours → aucune alerte', () => egal(avecRelance('2026-11-06'), null));
  test('pas de date de relance → aucune alerte', () => egal(avecRelance(null), null));
  test('dossier clos (Mis à disposition) → aucune alerte même en retard', () => egal(avecRelance('2026-10-01', 'MAD'), null));
  test('Refusé reste ouvert → alerte active', () => egal(avecRelance('2026-10-01', 'REFUSE'), 'retard'));
});

/* -------------------------------------------------------------------------- */
groupe('R4 / R5 — Relance', () => {
  test('email : objet et corps avec les FCI', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    const m = regles.email(d);
    egal(m.objet, 'Relance dossier SBA501404-THF010');
    vrai(m.corps.includes('Je reviens vers vous concernant le dossier SBA501404-THF010.'));
    vrai(m.corps.includes('FCI : F26154200726'));
  });
  test('email : « aucun » quand il n\'y a pas de FCI', () => {
    const { regles } = environnement();
    vrai(regles.email(regles.creer(saisie({ fci: '' })).dossier).corps.includes('FCI : aucun'));
  });
  test('relance suivante à J+7, statut inchangé', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie({ statutDft: 'EN_VALIDATION' })).dossier;
    const r = regles.planifierRelanceSuivante(d.id);
    egal(r.dossier.dateRelance, '2026-11-09');
    egal(r.dossier.statutDft, 'EN_VALIDATION');
  });
});

/* -------------------------------------------------------------------------- */
groupe('R6 — Historique', () => {
  test('la création ouvre l\'historique', () => {
    const { regles } = environnement();
    egal(regles.creer(saisie()).dossier.historique.map(e => e.action), ['creation']);
  });
  test('une modification décrit ce qui change', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    const r = regles.modifier(d.id, { statutDft: 'REFUSE' });
    egal(r.dossier.historique.at(-1).detail, 'Statut DFT : À faire → Refusé');
  });
  test('une modification sans effet n\'ajoute rien', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    const r = regles.modifier(d.id, { statutDft: 'A_FAIRE' });
    vrai(r.inchange); egal(regles.modifier(d.id, {}).dossier.historique.length, 1);
  });
  test('la préparation d\'un email est notée', () => {
    const { regles } = environnement();
    const d = regles.creer(saisie()).dossier;
    egal(regles.noterRelance(d.id).dossier.historique.at(-1).action, 'relance');
  });
});

/* -------------------------------------------------------------------------- */
groupe('R7 — Suppression et annulation', () => {
  test('supprimer renvoie les dossiers retirés', () => {
    const { regles, store } = environnement();
    const d = regles.creer(saisie()).dossier;
    const r = regles.supprimer(d.id);
    vrai(r.ok); egal(r.retires.map(x => x.gcblo), ['SBA501404-THF010']); egal(store.tous().length, 0);
  });
  test('restaurer remet le dossier à l\'identique', () => {
    const { regles, store } = environnement();
    const d = regles.creer(saisie({ commentaire: 'à garder' })).dossier;
    const { retires } = regles.supprimer(d.id);
    regles.restaurer(retires);
    egal(store.parId(d.id), d);
  });
  test('restaurer annule aussi une modification', () => {
    const { regles, store } = environnement();
    const d = regles.creer(saisie()).dossier;
    const { avant } = regles.modifier(d.id, { statutDft: 'REFUSE' });
    regles.restaurer([avant]);
    egal(store.parId(d.id).statutDft, 'A_FAIRE');
  });
});

/* -------------------------------------------------------------------------- */
groupe('Modifications groupées', () => {
  test('applique le même changement à plusieurs dossiers', () => {
    const { regles } = environnement();
    const a = regles.creer(saisie()).dossier, b = regles.creer(saisie({ gcblo: 'SBA501423-THF010' })).dossier;
    const r = regles.modifierPlusieurs([a.id, b.id], { statutDft: 'MAD' });
    egal([r.modifies, r.inchanges], [2, 0]);
  });
  test('tout ou rien : un refus annule l\'ensemble', () => {
    const { regles, store } = environnement();
    const a = regles.creer(saisie()).dossier;
    const r = regles.modifierPlusieurs([a.id, 'inconnu'], { statutDft: 'MAD' });
    vrai(!r.ok); egal(store.parId(a.id).statutDft, 'A_FAIRE');
  });
  test('un seul enregistrement pour tout le groupe', () => {
    const { regles, store } = environnement();
    const ids = ['SBA501404-THF010', 'SBA501423-THF010', 'SBA501487-THF010'].map(g => regles.creer(saisie({ gcblo: g })).dossier.id);
    let evenements = 0; store.ecouter(() => evenements++);
    regles.modifierPlusieurs(ids, { type: 'SOGETREL' });
    egal(evenements, 1);
  });
});

/* -------------------------------------------------------------------------- */
groupe('Filtres, tri, statistiques', () => {
  const peuple = () => {
    const env = environnement();
    env.regles.creer({ type: 'NUM21', gcblo: 'SBA501404-THF010', fci: 'F26154200726', dateRelance: '2026-10-30' });
    env.regles.creer({ type: 'AIR', gcblo: 'LRO500767-THF010', fci: '', statutDft: 'REFUSE', dateAffectation: '2026-10-01' });
    env.regles.creer({ type: 'SOGETREL', gcblo: 'EST501479-THF011', fci: 'F09075260926', statutDft: 'MAD', commentaire: 'Attente client', dateRelance: '2026-10-01' });
    return env;
  };
  test('filtre par type', () => egal(peuple().regles.filtrer({ type: 'AIR' }).map(d => d.gcblo), ['LRO500767-THF010']));
  test('filtre par statut', () => egal(peuple().regles.filtrer({ statut: 'MAD' }).map(d => d.gcblo), ['EST501479-THF011']));
  test('filtre « en retard » (le dossier clos est exclu)', () => egal(peuple().regles.filtrer({ retard: true }).map(d => d.gcblo), ['SBA501404-THF010']));
  test('filtre « sans FCI »', () => egal(peuple().regles.filtrer({ sansFci: true }).map(d => d.gcblo), ['LRO500767-THF010']));
  test('recherche : morceau de GCBLO, sans tiret', () => egal(peuple().regles.filtrer({ texte: '501404' }).length, 1));
  test('recherche : commentaire sans accents ni majuscules', () => egal(peuple().regles.filtrer({ texte: 'attente CLIENT' }).length, 1));
  test('recherche : plusieurs mots se cumulent', () => egal(peuple().regles.filtrer({ texte: 'est501479 F0907' }).length, 1));
  test('tri par relance : sans date en dernier', () => {
    const { regles, store } = peuple();
    egal(regles.trier(store.tous(), { cle: 'dateRelance', sens: 'asc' }).map(d => d.gcblo), ['EST501479-THF011', 'SBA501404-THF010', 'LRO500767-THF010']);
  });
  test('tri par statut suit l\'ordre de config.js', () => {
    const { regles, store } = peuple();
    egal(regles.trier(store.tous(), { cle: 'statutDft', sens: 'asc' }).map(d => d.statutDft), ['A_FAIRE', 'MAD', 'REFUSE']);
  });
  test('statistiques', () => {
    const s = peuple().regles.statistiques();
    egal([s.total, s.parType.NUM21, s.parType.AIR, s.parType.SOGETREL, s.retard, s.sansFci], [3, 1, 1, 1, 1, 1]);
  });
});

/* -------------------------------------------------------------------------- */
groupe('Store et enregistrement', () => {
  test('les données survivent à un rechargement', () => {
    const { regles, support } = environnement();
    regles.creer(saisie());
    egal(creerStore(support).tous().map(d => d.gcblo), ['SBA501404-THF010']);
  });
  test('les abonnés reçoivent le type d\'événement et les ids', () => {
    const { regles, store } = environnement();
    const recus = []; store.ecouter(e => recus.push(e.type));
    const d = regles.creer(saisie()).dossier;
    regles.modifier(d.id, { commentaire: 'x' }); regles.supprimer(d.id);
    egal(recus, ['ajout', 'modification', 'suppression']);
  });
  test('un échec d\'écriture est signalé sans planter', () => {
    const store = creerStore({ lire: () => null, ecrire: () => false });
    let evt = null; store.ecouter(e => { evt = e; });
    creerDossiers(store, { horloge: () => MAINTENANT }).creer(saisie());
    egal(evt.enregistre, false);
  });
});

groupe('Statistiques — relances à venir', () => {
  test('compte les relances des 7 jours, sans les dossiers clos ni le retard', () => {
    const store = creerStore(supportMemoire());
    const r = creerDossiers(store, { horloge: () => new Date(2026, 10, 2, 9) });
    const mk = (g, rel, statut) => { const res = r.creer({ gcblo: g, type: 'NUM21', dateAffectation: '2026-10-01', dateRelance: rel }); if (statut) r.modifier(res.dossier.id, { statutDft: statut }); };
    mk('SBA000001-THF001', '2026-11-02'); mk('SBA000002-THF001', '2026-11-04'); mk('SBA000003-THF001', '2026-11-04');
    mk('SBA000004-THF001', '2026-11-08'); mk('SBA000005-THF001', '2026-11-09'); mk('SBA000006-THF001', '2026-10-30');
    mk('SBA000007-THF001', '2026-11-03', 'MAD');
    egal(r.statistiques().aVenir, [1, 0, 2, 0, 0, 0, 1]);
  });
});

groupe('Commune et valorisation', () => {
  test('montants : nombre, texte français, vide, illisible', () => {
    egal([lireMontant(1250.456), lireMontant('1 234,56 €'), lireMontant('99'), lireMontant(''), lireMontant(null)], [1250.46, 1234.56, 99, null, null]);
    vrai(Number.isNaN(lireMontant('abc')));
  });
  test('affichage en euros', () => egal(formaterMontant(1234.5).replace(/\s/g, ' '), '1 234,50 €'));
  test('création avec commune et valorisation', () => {
    const r = creerDossiers(creerStore(supportMemoire()), { horloge: () => new Date(2026, 10, 3, 9) });
    const c = r.creer({ type: 'AIR', gcblo: 'SBA501404-THF010', commune: ' Mérignac ', valorisation: '1 250,50' });
    egal([c.dossier.commune, c.dossier.valorisation], ['Mérignac', 1250.5]);
  });
  test('valorisation illisible refusée', () => {
    const r = creerDossiers(creerStore(supportMemoire()));
    vrai(!r.creer({ type: 'AIR', gcblo: 'SBA501404-THF010', valorisation: 'beaucoup' }).ok);
  });
  test('modification notée dans l\'historique', () => {
    const r = creerDossiers(creerStore(supportMemoire()));
    const d = r.creer({ type: 'AIR', gcblo: 'SBA501404-THF010' }).dossier;
    egal(r.modifier(d.id, { commune: 'Pessac', valorisation: 80 }).dossier.historique.at(-1).detail.replace(/\s/g, ' '), 'Commune : vide → Pessac · Valorisation : aucune → 80,00 €');
  });
  test('un dossier plus ancien, sans ces champs, ne reçoit pas de fausse ligne d\'historique', () => {
    const store = creerStore(supportMemoire());
    const r = creerDossiers(store);
    const d = r.creer({ type: 'AIR', gcblo: 'SBA501404-THF010' }).dossier;
    const ancien = { ...d }; delete ancien.commune; delete ancien.valorisation;
    store.remplacer(ancien);
    egal(r.modifier(d.id, { statutDft: 'REFUSE' }).dossier.historique.at(-1).detail, 'Statut DFT : À faire → Refusé');
  });
  test('la recherche trouve la commune', () => {
    const r = creerDossiers(creerStore(supportMemoire()));
    r.creer({ type: 'AIR', gcblo: 'SBA501404-THF010', commune: 'Le Haillan' });
    egal(r.filtrer({ texte: 'haillan' }).length, 1);
  });
});

groupe('Statuts Litige, Annulé, Attach', () => {
  test('Annulé et Attach sont clos : plus d\'alerte de relance ; Litige reste suivi', () => {
    const r = creerDossiers(creerStore(supportMemoire()), { horloge: () => new Date(2026, 10, 4, 9) });
    let n = 0;
    const etat = statut => { const d = r.creer({ type: 'AIR', gcblo: `SBA50100${n++}-THF010`, dateRelance: '2026-10-01' }).dossier; return r.etatRelance(r.modifier(d.id, { statutDft: statut }).dossier); };
    egal([etat('ANNULE'), etat('ATTACH'), etat('LITIGE')], [null, null, 'retard']);
  });
});

groupe('ls : plusieurs affects ou statuts', () => {
  const env = () => {
    const r = creerDossiers(creerStore(supportMemoire()));
    [['NUM21', 'A_FAIRE'], ['SOGETREL', 'LITIGE'], ['AIR', 'LITIGE'], ['NUM21', 'ATTACH']].forEach(([type, st], i) => {
      const d = r.creer({ type, gcblo: `SBA50100${i}-THF010` }).dossier; r.modifier(d.id, { statutDft: st });
    });
    return r;
  };
  test('liste d\'affects : l\'un ou l\'autre', () => egal(env().filtrer({ type: ['NUM21', 'SOGETREL'] }).length, 3));
  test('liste de statuts : l\'un ou l\'autre', () => egal(env().filtrer({ statut: ['LITIGE', 'ATTACH'] }).length, 3));
  test('affects et statuts se combinent', () => egal(env().filtrer({ type: ['NUM21', 'SOGETREL'], statut: ['LITIGE'] }).map(d => d.type), ['SOGETREL']));
  test('un seul affect (ancienne écriture) toujours compris', () => egal(env().filtrer({ type: 'AIR' }).length, 1));
});

groupe('Date affect', () => {
  const env = () => {
    const r = creerDossiers(creerStore(supportMemoire()), { horloge: () => new Date(2026, 10, 4, 9) });
    r.creer({ type: 'AIR', gcblo: 'SBA501001-THF010', dateAffectation: '2026-03-12' });
    r.creer({ type: 'AIR', gcblo: 'SBA501002-THF010', dateAffectation: '2026-03-20' });
    r.creer({ type: 'AIR', gcblo: 'SBA501003-THF010', dateAffectation: '2025-03-12' });
    r.creer({ type: null, gcblo: 'SBA501004-THF010', dateAffectation: null });
    return r;
  };
  test('peut être vide (import) ; le jour même par défaut', () => {
    const r = env();
    egal([r.filtrer({ texte: '501004' })[0].dateAffectation, r.creer({ type: 'AIR', gcblo: 'SBA501005-THF010' }).dossier.dateAffectation], [null, '2026-11-04']);
  });
  test('filtre par jour, par mois, plusieurs', () => {
    const r = env();
    egal(r.filtrer({ dates: [{ jour: '2026-03-12' }] }).map(d => d.gcblo), ['SBA501001-THF010']);
    egal(r.filtrer({ dates: [{ mois: '2026-03' }] }).length, 2);
    egal(r.filtrer({ dates: [{ jour: '2026-03-12' }, { jour: '2025-03-12' }] }).length, 2);
  });
  test('lecture de « ls 12/03 », « ls 03/2026 », « ls 12/03/2025 »', async () => {
    const { analyser, criteresListe } = await import('../js/jarvis/analyse.js');
    const r = env(), ctx = { dossiers: [], aujourdhui: '2026-11-04', regles: r };
    const c = t => criteresListe(analyser(t, t.length, ctx).valeurs).dates;
    egal([c('ls 12/03'), c('ls 03/2026'), c('ls 12/3/2025')], [[{ jour: '2026-03-12' }], [{ mois: '2026-03' }], [{ jour: '2025-03-12' }]]);
    vrai(analyser('ls 31/02 ', 9, ctx).erreurs.length > 0);
  });
});
