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
| Jarvis : commandes en français, au clavier ou à la voix | Connexion Microsoft 365 (Outlook, SharePoint) |
| Thème Terminal avec la lumière de Jarvis | |

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
4. **Email de relance** : objet `Relance dossier [GCBLO]`, corps avec le GCBLO et les FCI (ou « aucun »). Il s'ouvre dans Outlook avec le destinataire réglé dans les paramètres.
5. **Relance suivante** : après une relance, on peut planifier la suivante à J+7 (délai réglable). Le statut DFT ne change pas.
6. **Historique** : chaque création, modification ou relance ajoute une ligne. On ne la modifie jamais.
7. **Suppression** : toujours confirmée et annulable juste après.

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
  store.js                 lecture et écriture des données (localStorage)
  dossiers.js              les règles du §3 : créer, modifier, valider, filtrer, alertes
  ui/
    registre.js            la liste des dossiers
    filtres.js             recherche, filtres, tri, compteurs
    fiche.js               fenêtre détail et formulaire
  jarvis/
    grammaire.js           le vocabulaire de Jarvis, sous forme de tableau lisible
    parser.js              phrase → intention (ne modifie rien)
    actions.js             intention → appel aux règles de dossiers.js
    console.js             le fil de conversation et la saisie
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

## 5. Jarvis

Jarvis traite chaque phrase en étapes séparées, chacune testable seule :

```
« suprime 501404 et 501423 »
  1. nettoyer      → minuscules, accents, espaces
  2. corriger      → « supprime » (faute de frappe)
  3. découper      → « … puis … » donne plusieurs commandes
  4. reconnaître   → intention SUPPRIMER, cibles [501404, 501423]
  5. résoudre      → retrouver les dossiers (référence complète ou partielle)
  6. confirmer     → obligatoire si destructif ou groupé
  7. exécuter      → via dossiers.js
  8. répondre      → message, boutons, état de la lumière
```

**Différence avec la v1** : le vocabulaire n'est plus une pile d'expressions régulières dispersées dans le code. C'est un **tableau** dans `grammaire.js`, une ligne par intention. Ajouter une commande revient à ajouter une ligne :

| Intention | Déclencheurs (exemples) | Paramètres | Confirmation |
| --- | --- | --- | --- |
| `CREER` | ajoute, crée, nouveau | GCBLO, type, FCI, statut | non (demande le type s'il manque) |
| `SUPPRIMER` | supprime, efface, retire | cibles | **toujours** |
| `STATUT` | passe, mets, marque + un statut | cibles, statut | si plus de 3 dossiers |
| `TYPE` | passe + un type | cibles, type | si plus de 3 dossiers |
| `RELANCER` | relance (sans date) | cible | non |
| `PLANIFIER` | relance + une date | cibles, date | si plus de 3 dossiers |
| `COMPLETER` | ajoute le fci…, note… | cible, FCI ou texte | non |
| `FILTRER` | montre, affiche, cherche | type, statut, retard, texte | non |
| `BRIEFING` | quoi de neuf, à relancer | — | non |
| `COMPTER` | combien, stats | type, statut | non |
| `ANNULER` | annule | — | non |
| `AIDE` | aide | — | non |

« le », « la », « le dernier » désignent le dernier dossier évoqué.

Jarvis est un **interpréteur intégré, pas une IA en ligne** : il fonctionne hors connexion et rien ne quitte le navigateur.

### La lumière

Elle respire au milieu de la ligne de commande. Son état reflète ce que fait Jarvis :

| État | Couleur | Rythme | Quand |
| --- | --- | --- | --- |
| repos | cyan | lent | rien en cours |
| alerte | ambre | moyen | au moins une relance en retard |
| frappe | vert | rapide, éclat à chaque touche | tu écris |
| écoute | rouge | très rapide | micro ouvert |
| attente | cyan, anneau qui tourne | — | Jarvis attend ta réponse (oui/non, choix) |
| voix | cyan | pulsation rapide | Jarvis parle |
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
| 0 | Ce document | Tu le valides ou tu le corriges |
| 1 | Données et règles (`config`, `store`, `dossiers`) + tests | La page de tests est entièrement verte |
| 2 | Registre en thème Terminal : liste, filtres, tri, fiche, formulaire | Créer, modifier, supprimer, filtrer sur téléphone et PC |
| 3 | Jarvis, partie compréhension (`grammaire`, `parser`) + tests de phrases | Chaque phrase d'exemple donne la bonne intention |
| 4 | Jarvis, partie action (`actions`, `console`, `lumiere`) | Piloter le registre en parlant à Jarvis |
| 5 | Finitions : micro et voix, accessibilité, petits écrans | Utilisation au quotidien |

---

## 8. À valider avant de commencer

1. **Sauvegarde** : sans export, les données n'existent que dans ce navigateur. Vider le cache les efface. Je propose une **sauvegarde/restauration JSON** minimale (deux boutons) dès l'étape 2. D'accord ?
2. **Tes dossiers actuels** : faut-il les reprendre ? Le plus simple : une sauvegarde JSON depuis l'ancienne version, que la v2 sait relire.
3. **« Refusé »** : le dossier reste ouvert (alertes de relance actives). C'est bien ça ?
4. **Champs** : en manque-t-il un dans le §2 (priorité, interlocuteur, adresse…), ou un est-il inutile ?
