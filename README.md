# Registre GCBLO — v2

Suivi des affectations de dossiers GCBLO (NUM21, AIR, Sogetrel), piloté depuis une invite de commande avec autocomplétion.

- **Le projet, ses règles et son organisation** : [FONDATION.md](FONDATION.md). C'est le document de référence : toute décision passe d'abord par lui.
- **L'ancienne version** est conservée sur la branche `v1-prototype`.

## Avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 0 | Fondation | ✅ |
| 1 | Données et règles + tests | ✅ |
| 2 | Moteur de l'invite (grammaire, analyse, autocomplétion) + tests | à venir |
| 3 | Écran : registre + invite en thème Terminal, sauvegarde, reprise v1 | à venir |
| 4 | Jarvis agit : actions, confirmations, annulation, lumière | à venir |
| 5 | Finitions : voix, accessibilité, petits écrans | à venir |

## Lancer les tests

Le code est découpé en modules JavaScript : le navigateur ne les charge que depuis une adresse web, pas en double-cliquant sur un fichier.

- **En ligne** : une fois GitHub Pages activé sur la branche, ouvrir `…/tests/`.
- **Sur un PC** : dans le dossier du projet, lancer `python -m http.server`, puis ouvrir `http://localhost:8000/tests/`.

La page affiche « ✓ tout est vert » quand toutes les règles sont respectées.

## Organisation (étape 1)

```
js/config.js     listes métier : types, statuts DFT, formats, délais, modèle d'email
js/dates.js      dates « jour » sans heure ni fuseau
js/store.js      garde et enregistre les dossiers, prévient l'interface des changements
js/dossiers.js   les règles : seul module autorisé à modifier les dossiers
tests/           outil de test minimal + un test par règle
```
