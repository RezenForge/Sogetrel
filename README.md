# Registre GCBLO — v2

Suivi des affectations de dossiers GCBLO (NUM21, AIR, Sogetrel), piloté depuis une invite de commande avec autocomplétion.

- **Le projet, ses règles et son organisation** : [FONDATION.md](FONDATION.md). C'est le document de référence : toute décision passe d'abord par lui.
- **L'ancienne version** est conservée sur la branche `v1-prototype`.

## Utilisation

Ouvrir **https://rezenforge.github.io/Sogetrel/** et commencer à taper : les propositions suivent. `aide` liste les commandes.

Au premier lancement, les dossiers de la version 1 enregistrés dans ce navigateur sont repris automatiquement. Faire régulièrement `sauvegarde` : vider le cache du navigateur efface les données.

| Touche | Effet |
| --- | --- |
| `Tab` ou `→` | accepte la proposition (texte grisé) |
| `↑` `↓` | parcourent les propositions, ou l'historique si la ligne est vide |
| `Entrée` | exécute (ou choisit la proposition sélectionnée) |
| `Échap` | ferme les propositions, puis vide la ligne |

### Au quotidien

| Pour… | Faire |
| --- | --- |
| savoir quoi faire aujourd'hui | rien : le **point du jour** s'affiche à l'ouverture (ou `jour`) |
| ajouter une liste de dossiers | **coller** dans l'invite une liste copiée d'Excel ou d'un mail : le type est repris des colonnes du classeur robot, sinon demandé une fois |
| relancer tous les retards | `relance retard` : un email récapitulatif par destinataire, puis la relance suivante à J+7 est proposée |
| adresser les relances | `email air prenom.nom@…` (une fois par type) ; `email` affiche les réglages |
| changer un statut | `passe 501404 en refuse` |
| la météo | `meteo bordeaux`, `meteo le taillan medoc semaine`, `meteo merignac demain` |
| ce que veut dire un mot | `wiki "fibre optique"`, `wiki GPON`, `def PBO` |
| tout le reste | `aide` |

## Avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 0 | Fondation | ✅ |
| 1 | Données et règles + tests | ✅ |
| 2 | Moteur de l'invite (grammaire, analyse, autocomplétion) + tests | ✅ |
| 3 | Terminal : écran, saisie, reprise v1, sauvegarde | ✅ version de base — style à venir |
| + | Point du jour, collage d'une liste, relance groupée, destinataires par type | ✅ |
| 4 | Jarvis : phrases naturelles, enchaînements, « tous les air », lumière | à venir |
| 5 | Finitions : voix, accessibilité, petits écrans | à venir |

## Lancer les tests

Le code est découpé en modules JavaScript : le navigateur ne les charge que depuis une adresse web, pas en double-cliquant sur un fichier.

- **En ligne** : une fois GitHub Pages activé sur la branche, ouvrir `…/tests/`.
- **Sur un PC** : dans le dossier du projet, lancer `python -m http.server`, puis ouvrir `http://localhost:8000/tests/`.

La page affiche « ✓ tout est vert » quand toutes les règles sont respectées.

## Services extérieurs

Deux commandes contactent un service, et n'envoient que ce que vous tapez après elles : `meteo` ([Open-Meteo](https://open-meteo.com), gratuit et sans compte : le nom de la ville) et `wiki` ([Wikipédia](https://fr.wikipedia.org) en français : le terme cherché). Open-Meteo est gratuit pour un usage non commercial ; pour un usage professionnel régulier, leurs conditions prévoient un abonnement.

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
js/meteo.js              prévisions Open-Meteo (service extérieur)
js/wiki.js               définitions Wikipédia (service extérieur)
js/jarvis/grammaire.js   les commandes, sous forme de tableau (source unique)
js/jarvis/analyse.js     comprend la ligne tapée (ne modifie rien)
js/jarvis/completion.js  propositions, texte grisé, aperçu (ne modifie rien)
js/jarvis/actions.js     exécute une commande via les règles
js/jarvis/invite.js      l'écran du terminal et le clavier
tests/                   134 tests : règles, analyse, autocomplétion, collage, relances, météo et wiki (services simulés)
```
