# Registre GCBLO v2 : document de fondation

Ce document décrit **ce que l'application fait, comment ses données sont faites et comment le code est rangé**, avant d'écrire la moindre ligne. On le valide ensemble ; ensuite chaque étape de construction s'y réfère. S'il faut changer une décision, on change d'abord ce document.

La version précédente est conservée sur la branche `v1-prototype`.

---

## 1. Ce que fait l'application (périmètre v2)

| Inclus maintenant | Prévu plus tard (la base doit le permettre) |
| --- | --- |
| Registre des dossiers GCBLO : liste, recherche, filtres, tri | Import du classeur Excel « robot » |
| Création, modification, suppression d'un dossier | Exports Excel / CSV |
| Statut DFT et alertes de relance | Animations (bâtisseurs, écrasement) |
| Préparation de l'email de relance (Outlook) | Autres thèmes que Terminal |
| **L'invite de commande Jarvis, avec autocomplétion intelligente** (interface principale) | Connexion Microsoft 365 (Outlook, SharePoint) |
| Sauvegarde / restauration JSON, reprise des dossiers de la v1 | |
| Météo d'une ville (commande `meteo`) | |
| Définition d'un mot ou d'une expression (commande `wiki`, Wikipédia) | |
| Thème Terminal avec la lumière de Jarvis | |

**Principe directeur** : tout se fait depuis l'invite de commande, sans rien apprendre par cœur. On tape quelques lettres, l'invite propose la suite. La liste des dossiers est l'écran qui montre le résultat. Les clics restent possibles, mais en second.

L'application s'ouvre par le lien GitHub Pages. Elle fonctionne sans serveur : les données restent dans le navigateur de l'appareil.

---

## 2. Un dossier

| Champ | Contenu | Règle |
| --- | --- | --- |
| `id` | identifiant interne | créé automatiquement, jamais affiché |
| `type` | `NUM21`, `AIR` ou `SOGETREL` | obligatoire |
| `gcblo` | ex. `SBA501404-THF010` | obligatoire, format `AAA000000-AAA000`, **unique** |
| `fci` | liste, ex. `["F26154200726"]` | 0, 1 ou plusieurs ; format `F` + 11 chiffres |
| `dateAffectation` | date | obligatoire, aujourd'hui par défaut |
| `dateRelance` | date ou vide | facultative |
| `statutDft` | voir ci-dessous | `A_FAIRE` par défaut |
| `commentaire` | texte libre | facultatif |
| `historique` | liste de `{ date, action, détail }` | rempli automatiquement à chaque changement |
| `creeLe`, `modifieLe` | date et heure | automatiques |

### Statuts DFT

| Code | Libellé | Couleur (Terminal) | Clôt le dossier ? |
| --- | --- | --- | --- |
| `A_FAIRE` | À faire | gris clair | non |
| `EN_VALIDATION` | En cours de validation | cyan | non |
| `MAD` | Mis à disposition | vert | **oui** |
| `REFUSE` | Refusé | rouge | non (à reprendre) |

Un dossier **clos** n'a plus d'alerte de relance.

---

## 3. Les règles

1. **Doublon** : on ne peut pas créer deux dossiers avec le même GCBLO, quel que soit le type.
2. **Relance en retard** : la date de relance est passée et le dossier n'est pas clos. La ligne est marquée en rouge.
3. **Relance proche** : la date tombe aujourd'hui ou dans les 3 jours. La ligne est marquée en orange.
4. **Email de relance** : objet `Relance dossier [GCBLO]`, corps avec le GCBLO et les FCI (ou « aucun »). Il s'ouvre dans Outlook, adressé au **destinataire du type** du dossier (réglé une fois par type : NUM21, AIR, Sogetrel).
   **Relance groupée** : pour plusieurs dossiers, un seul email récapitulatif par destinataire (objet `Relance dossiers (N)`, une ligne par dossier avec ses FCI). Après l'email, la relance suivante à J+7 est proposée pour tous.
5. **Relance suivante** : après une relance, on peut planifier la suivante à J+7 (délai réglable). Le statut DFT ne change pas.
6. **Historique** : chaque création, modification ou relance ajoute une ligne. On ne la modifie jamais.
7. **Suppression** : toujours confirmée et annulable juste après.
8. **Point du jour** : à l'ouverture et sur demande, quatre listes : relances en retard, relances du jour, relances dans les 3 jours, dossiers refusés (à reprendre). Les dossiers clos n'y figurent jamais.
9. **Création en lot** (collage d'une liste) : chaque ligne est validée comme une création normale (R1 à R6). Les lignes valides sont créées ensemble, les autres sont listées avec leur motif. Tout le lot s'annule d'un coup.

Toutes ces règles vivent dans **un seul fichier** (`js/dossiers.js`), et chacune a un test.

---

## 4. Comment le code est rangé

```
index.html                 la structure de la page, rien d'autre
css/
  base.css                 mise en page « écran unique », typographie, composants
  terminal.css             le thème : uniquement des variables de couleur et les effets
js/
  main.js                  démarrage : branche les modules entre eux
  config.js                listes métier : types, statuts, délais, modèle d'email
  dates.js                 calculs de dates « jour » (sans heure, sans fuseau)
  store.js                 lecture et écriture des données (localStorage)
  dossiers.js              les règles du §3 : créer, modifier, valider, filtrer, alertes
  ui/
    registre.js            la liste des dossiers
    filtres.js             recherche, filtres, tri, compteurs
    fiche.js               fenêtre détail et formulaire
  jarvis/
    grammaire.js           les commandes et leurs emplacements, sous forme de tableau
    analyse.js             texte tapé → commande comprise + ce qui manque (ne modifie rien)
    completion.js          propositions classées, texte fantôme, aperçu de l'effet
    actions.js             commande validée → appel aux règles de dossiers.js
    invite.js              la ligne de saisie, la liste de propositions, le fil
    lumiere.js             la lumière : ses états et ses transitions
tests/
  index.html               tous les tests, lancés dans le navigateur
```

### La règle d'or : les données circulent dans un seul sens

```
  clic, formulaire ou Jarvis
            │
            ▼
      dossiers.js  ── vérifie les règles, refuse si invalide
            │
            ▼
        store.js   ── enregistre, puis annonce « tel dossier a changé »
            │
            ▼
  registre, compteurs, fiche  ── mettent à jour ce qui a changé, et seulement ça
```

- Seul `dossiers.js` modifie les données. L'interface et Jarvis lui **demandent**, ils n'écrivent jamais eux-mêmes.
- Le registre met à jour **la ligne concernée** au lieu de tout reconstruire. C'est aussi ce qui rendra les animations simples plus tard.
- Un module n'utilise que ce qu'un autre exporte explicitement : pas de variables partagées cachées.

---

## 5. L'invite de commande (Jarvis)

C'est le cœur de l'application. Trois idées la guident :

1. **On ne retient rien par cœur** : à chaque instant, l'invite sait ce qu'on est en train d'écrire et propose la suite.
2. **On voit l'effet avant de valider** : une ligne d'aperçu dit ce qui va se passer.
3. **On peut écrire comme on parle** : « passe-le en refusé » marche aussi. Les fautes et les accents oubliés sont tolérés.

### Les commandes

Chaque commande commence par un verbe, suivi d'**emplacements** à remplir dans l'ordre. Les mots entre `‹ ›` sont proposés automatiquement.

| Commande | Forme | Exemple |
| --- | --- | --- |
| Ajouter | `ajoute ‹gcblo› ‹type› [fci ‹fci…›] [relance ‹date›] [note "…"]` | `ajoute SBA202020-THF010 air fci F12345678901` |
| Changer le statut | `passe ‹dossiers› en ‹statut›` | `passe 501404 en refusé` |
| Changer le type | `passe ‹dossiers› en ‹type›` | `passe 501404 en sogetrel` |
| Relancer | `relance ‹dossier›` (email) · `relance ‹dossiers› ‹date›` (planifier) | `relance 501404 lundi` |
| Compléter | `fci ‹dossier› ‹fci…›` · `note ‹dossier› "…"` | `note 501404 "attente client"` |
| Supprimer | `supprime ‹dossiers›` | `supprime tous les refusés` |
| Afficher | `montre [‹type›] [‹statut›] [retard] [sans-fci] [texte]` | `montre air en retard` |
| Ouvrir | `ouvre ‹dossier›` | `ouvre 501404` |
| Compter | `combien [‹type›] [‹statut›]` | `combien de refusés` |
| Point du jour | `jour` (aussi affiché à l'ouverture) | `jour` |
| Destinataires | `email [‹type›] [‹adresse›\|aucun]` | `email air jean.dupont@exemple.fr` |
| Météo | `meteo ‹ville› [jour\|demain\|semaine]` | `meteo le taillan medoc semaine` |
| Définition | `wiki ‹mot ou expression›` (aussi `def`) | `wiki "fibre optique"`, `wiki GPON` |
| Coller une liste | coller dans l'invite plusieurs lignes copiées d'Excel ou d'un mail | colonnes du classeur robot reconnues |
| Divers | `annule` · `aide` · `sauvegarde` · `restaure` · `clear` | |

`‹dossiers›` accepte : un GCBLO complet ou un morceau (`501404`), plusieurs (`501404 501423`), ou un groupe : `retard` (relances en retard) et `proches` (relances dans les 3 jours). Exemple : `relance retard` prépare l'email récapitulatif de tous les retards. *Prévu ensuite : `le` (dernier dossier évoqué), `tous les air`, `tous les refusés`.*

Enchaîner : `ajoute SBA202020-THF010 air puis relance-le demain`.

### L'autocomplétion

Pendant la frappe, l'invite **analyse la ligne** et sait quel emplacement on est en train de remplir. Elle propose alors des valeurs adaptées :

| On est en train d'écrire… | L'invite propose |
| --- | --- |
| le début de la ligne | les verbes (`pa` → `passe`), puis les dernières commandes utilisées |
| un dossier | les GCBLO qui correspondent (`5014` → `SBA501404-THF010`), avec leur type, statut et alerte de relance |
| après `en` | les statuts, ou les types pour `passe` |
| une date | `demain`, `lundi 09/11`, `dans 3 jours`… avec la date calculée |
| un nouveau GCBLO (`ajoute`) | rien à deviner : vérification en direct du format et des doublons |

**Le classement des propositions dépend de la commande.** Pour `relance`, les dossiers en retard passent en premier. Pour `ouvre`, ce sont les derniers consultés. Pour les autres, la correspondance exacte passe avant la correspondance partielle.

**Ergonomie au clavier** (inspirée des terminaux modernes) :

| Touche | Effet |
| --- | --- |
| frappe | la meilleure proposition apparaît en grisé après le curseur (texte fantôme) |
| `Tab` ou `→` | accepte la proposition ; `Tab` à nouveau passe à la suivante |
| `↑` `↓` | parcourt la liste des propositions (ou l'historique si la ligne est vide) |
| `Entrée` | exécute la commande, ou choisit la proposition sélectionnée |
| `Ctrl+R` | recherche dans l'historique des commandes |
| `Échap` | ferme les propositions, puis vide la ligne |

**Ce qui s'affiche autour de la ligne** :
- **Couleurs** : le verbe, les dossiers, les valeurs et les erreurs ont chacun leur couleur. On voit tout de suite si un mot n'est pas compris.
- **Aperçu** : sous la ligne, par exemple `→ SBA501404-THF010 : À faire → Refusé` ou `→ 3 dossiers supprimés (confirmation demandée)`.
- **Sur téléphone** : les propositions s'affichent en boutons au-dessus du clavier, assez grands pour le doigt.

### Comment c'est construit

```
texte tapé + position du curseur
        │
        ▼
  analyse.js     découpe en mots, corrige les fautes, aligne sur la grammaire
                 → commande reconnue, emplacements remplis, emplacement en cours, erreurs
        │
        ├──► completion.js   propositions classées + texte fantôme + aperçu   (à chaque touche)
        │
        └──► actions.js      exécution via dossiers.js                         (à Entrée)
```

- `grammaire.js` est un **tableau** : une ligne par commande, avec ses verbes et la liste de ses emplacements (type de valeur attendu, obligatoire ou non, mot d'introduction comme `en`). L'analyse et l'autocomplétion lisent toutes les deux ce même tableau. Ajouter une commande revient donc à ajouter une ligne, et l'autocomplétion la connaît aussitôt.
- `analyse.js` et `completion.js` ne touchent jamais aux données : ils sont testés seuls, phrase par phrase.
- Les confirmations sont **obligatoires** pour supprimer, et pour toute action qui touche plus de 3 dossiers.

Jarvis est un **interpréteur intégré, pas une IA en ligne** : il fonctionne hors connexion et rien ne quitte le navigateur. **Deux exceptions : `meteo`**, qui envoie le nom de la ville au service Open-Meteo (gratuit, sans compte), puis ses coordonnées, **et `wiki`**, qui envoie le terme cherché à Wikipédia en français. Aucune donnée de dossier n'est envoyée. Ces modules sont isolés dans `js/meteo.js` et `js/wiki.js`.

### La lumière

Elle respire au milieu de la ligne de commande. Son état reflète ce que fait Jarvis :

| État | Couleur | Rythme | Quand |
| --- | --- | --- | --- |
| repos | cyan | lent | rien en cours |
| alerte | ambre | moyen | au moins une relance en retard |
| frappe | vert | rapide, éclat à chaque touche | la ligne est valide |
| incomplet | ambre | rapide | la ligne a une erreur ou un emplacement manquant |
| écoute | rouge | très rapide | micro ouvert |
| attente | cyan, anneau qui tourne | — | Jarvis attend une confirmation |
| réussite / erreur | vert / rouge | bref, puis retour à l'état de base | après une commande |

Toutes les transitions passent par une seule fonction de `lumiere.js`.

---

## 6. Le thème Terminal

- **Une seule source de couleurs** : `terminal.css` ne contient que des variables (`--fond`, `--texte`, `--accent`, `--statut-refuse`…). Aucun composant n'écrit une couleur en dur. Un futur thème sera un autre fichier de variables, sans « corriger » celui-ci.
- Police JetBrains Mono, couleurs façon console Linux, léger balayage d'écran.
- Les informations s'affichent comme des sorties de commandes : `gcblo stats` pour les compteurs, `gcblo ls --type=AIR --dft=refuse` qui reflète les filtres actifs.
- **Écran unique** sur téléphone : la page ne défile jamais, seule la liste défile.

---

## 7. Les étapes de construction

Chaque étape se termine par une version utilisable, des tests qui passent et une explication de ce qui a été ajouté et pourquoi.

| # | Étape | Ce que tu peux vérifier |
| --- | --- | --- |
| 0 | Ce document | ✅ validé le 02/11/2026 |
| 1 | Données et règles (`config`, `dates`, `store`, `dossiers`) + tests | La page de tests est entièrement verte |
| 2 | Moteur de l'invite : `grammaire`, `analyse`, `completion` + tests de phrases | ✅ 02/11/2026 |
| 3 | Écran : terminal (sortie + invite, propositions, aperçu, couleurs), sauvegarde JSON, reprise v1 | ✅ version de base le 02/11/2026, publiée à la place de la v1 ; le style viendra ensuite |
| 4 | Jarvis agit : `actions`, confirmations, annulation, fil de réponses, lumière | Piloter tout le registre au clavier |
| 5 | Finitions : micro et voix, accessibilité, petits écrans | Utilisation au quotidien |

--- | --- | --- |
| 0 | Ce document | Tu le valides ou tu le corriges |
| 1 | Données et règles (`config`, `store`, `dossiers`) + tests | La page de tests est entièrement verte |
| 2 | Registre en thème Terminal : liste, filtres, tri, fiche, formulaire | Créer, modifier, supprimer, filtrer sur téléphone et PC |
| 3 | Jarvis, partie compréhension (`grammaire`, `parser`) + tests de phrases | Chaque phrase d'exemple donne la bonne intention |
| 4 | Jarvis, partie action (`actions`, `console`, `lumiere`) | Piloter le registre en parlant à Jarvis |
| 5 | Finitions : micro et voix, accessibilité, petits écrans | Utilisation au quotidien |

---

## 8. Décisions prises

| Question | Décision (02/11/2026) |
| --- | --- |
| Sauvegarde | Sauvegarde et restauration JSON dès l'étape 3 |
| Dossiers de la v1 | Repris via une sauvegarde JSON de l'ancienne version, que la v2 sait relire |
| « Refusé » | Reste ouvert : les alertes de relance restent actives |
| Champs d'un dossier | Ceux du §2, sans ajout pour l'instant |
| Interface principale | L'invite de commande avec autocomplétion ; la liste montre le résultat |

---

## 9. Journal des évolutions

| Date | Évolution |
| --- | --- |
| 02/11/2026 | v2 publiée : terminal avec autocomplétion, reprise de la v1 |
| 02/11/2026 | Point du jour (R8), collage d'une liste (R9), relance groupée et destinataires par type (R4) |
| 02/11/2026 | Commande `meteo` (Open-Meteo), villes consultées proposées en complétion |
| 02/11/2026 | Commande `wiki` : début de l'article Wikipédia (fr), pages d'homonymie signalées avec les autres sens |
