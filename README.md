# Registre GCBLO — v2

Suivi des affectations de dossiers GCBLO (NUM21, AIR, Sogetrel), piloté depuis une invite de commande avec autocomplétion.

- **Le projet, ses règles et son organisation** : [FONDATION.md](FONDATION.md). C'est le document de référence : toute décision passe d'abord par lui.
- **L'ancienne version** est conservée sur la branche `v1-prototype`.

## Utilisation

Ouvrir **https://rezenforge.github.io/Sogetrel/**.

**Les commandes sont en cours de refonte**, une par une (l'ancienne version est gardée dans la branche `v2-commandes`). Déjà refaites :

| Commande | Effet |
| --- | --- |
| `ls [affect] [statut] [retard] [sans-fci] [texte]` | affiche les dossiers, avec FCI, commune et valo |
| `open ‹dossier›` | la fiche complète |
| `set ‹dossiers› to ‹statut\|affect›` | change le statut DFT ou l'affect (ex. `set 501404 to refuse`, `set 501404 to air`) |
| `info ‹GCBLO…›` | tapez `info ` puis collez une colonne de GCBLO : affiche ceux qui sont dans la base (comme `ls`) et liste les introuvables |
| `edit ‹dossier› ‹champ› ‹valeur›` | modifie un champ (affect, statut, commune, valo, fci, affectation, relance, commentaire, gcblo) ; dans une fiche ou une liste, double-cliquer une valeur fait la même chose |
| `delete ‹dossiers›` | supprime, après confirmation |
| `import` | lit un classeur Excel : onglets 33, 16, 17, 79, 86, lignes `GCBLO` en colonne E, dossier en D, commune en G, valorisation en H, affect en I, FCI en J |
| `attachement fichier` | choisit le classeur d'attachement de référence (gardé dans le navigateur) |
| `attachement ‹dossier›` | remplit une copie de la référence (X5 commune, AG5 date, U6 GCBLO, paliers 30/60 en lignes 30-31) et l'enregistre en `‹GCBLO›.xlsx` |
| `cancel` | défait la dernière modification |
| `clear` | vide l'écran |
| `help [commande]` | la liste des commandes, ou le détail d'une commande |

**Les clics** : dans une liste, cliquer un GCBLO l'ouvre, `⋯` affiche les actions du dossier. Un clic ne fait rien de plus qu'une commande : il l'écrit dans la console et l'exécute, on peut donc toujours faire `cancel`.

| Touche | Effet |
| --- | --- |
| `Tab` ou `→` | accepte la proposition (texte grisé) |
| `↑` `↓` | parcourent les propositions, ou l'historique si la ligne est vide |
| `Entrée` | exécute (ou choisit la proposition sélectionnée) |
| `Échap` | ferme les propositions, puis vide la ligne |

## Avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 0 | Fondation | ✅ |
| 1 | Données et règles + tests | ✅ |
| 2 | Moteur de l'invite (grammaire, analyse, autocomplétion) + tests | ✅ |
| 3 | Terminal : écran, saisie, reprise v1, sauvegarde | ✅ version de base — style à venir |
| + | Point du jour, collage d'une liste, relance groupée, destinataires par type | ✅ |
| 3 bis | Refonte des commandes, une par une | en cours |
| 4 | Jarvis : phrases naturelles, enchaînements, « tous les air », lumière | à venir |
| 5 | Finitions : voix, accessibilité, petits écrans | à venir |

## Lancer les tests

Le code est découpé en modules JavaScript : le navigateur ne les charge que depuis une adresse web, pas en double-cliquant sur un fichier.

- **En ligne** : une fois GitHub Pages activé sur la branche, ouvrir `…/tests/`.
- **Sur un PC** : dans le dossier du projet, lancer `python -m http.server`, puis ouvrir `http://localhost:8000/tests/`.

La page affiche « ✓ tout est vert » quand toutes les règles sont respectées.

## Organisation

```
index.html               la page : zone de sortie + ligne de commande
css/terminal.css         le thème (variables de couleur uniquement)
css/base.css             la mise en page « écran unique » et les composants
js/main.js               le démarrage : branche les modules entre eux
js/config.js             listes métier : types, statuts DFT, formats, délais, modèle d'email
js/dates.js              dates « jour » sans heure ni fuseau
js/store.js              garde et enregistre les dossiers, prévient l'écran des changements
js/dossiers.js           les règles : seul module autorisé à modifier les dossiers
js/reprise-v1.js         relit les dossiers et sauvegardes de la version 1
js/reglages.js           destinataires des emails par type
js/collage.js            lit une liste collée (Excel, mail, classeur robot)
js/xlsx.js               lit un classeur Excel (.xlsx, .xlsm) et en écrit une copie modifiée, sans bibliothèque
js/import-excel.js       quels dossiers et FCI prendre dans le classeur (commande import)
js/attachement.js        quelles cellules remplir dans l'attachement d'un dossier
js/info.js               retrouve les dossiers d'une liste collée (commande info)
js/coffre.js             garde la référence d'attachement dans le navigateur (IndexedDB)
js/jarvis/grammaire.js   les commandes, sous forme de tableau (vide : en refonte)
js/jarvis/analyse.js     comprend la ligne tapée (ne modifie rien)
js/jarvis/completion.js  propositions, texte grisé, aperçu (ne modifie rien)
js/jarvis/actions.js     exécute une commande via les règles
js/jarvis/menus.js       le menu ⋯ d'un dossier : des commandes écrites à l'avance
js/jarvis/invite.js      l'écran du terminal et le clavier
tests/                   146 tests (classeur d'essai fictif : tests/donnees) : règles, dates, commandes, menu ⋯, collage, relances
```
