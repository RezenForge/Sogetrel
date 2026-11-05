# Registre GCBLO — v2

Suivi des affectations de dossiers GCBLO (NUM21, AIR, Sogetrel), piloté depuis une invite de commande avec autocomplétion.

- **Le projet, ses règles et son organisation** : [FONDATION.md](FONDATION.md). C'est le document de référence : toute décision passe d'abord par lui.
- **L'ancienne version** est conservée sur la branche `v1-prototype`.

## Utilisation

Ouvrir **https://rezenforge.github.io/Sogetrel/**.

**Les commandes sont en cours de refonte**, une par une (l'ancienne version est gardée dans la branche `v2-commandes`). Déjà refaites :

| Commande | Effet |
| --- | --- |
| `ls [affects…] [statuts…] [dates…] [retard\|proches] [sans-fci|fci-retard] [sans-valo] [sans-affect] [texte]` (ex. `ls num21 sogetrel`, `ls 12/03`, `ls 03/2026`) ; les dossiers Attach n'apparaissent qu'avec `ls attach` | affiche les dossiers : affect, GCBLO, commune, valo, FCI, statut DFT (Attach : ligne en vert clair) |
| `open ‹dossier›` | la fiche complète |
| `set ‹dossiers› to ‹statut\|affect›` | change le statut DFT ou l'affect (ex. `set 501404 to refuse`, `set 501404 to air`) |
| `ls ‹GCBLO collés…›` | tapez `ls ` puis collez une colonne de GCBLO (Excel, mail…), complets ou seulement leur début (`SBA501023`) : affiche ceux qui sont dans la base, dans l'ordre collé (Attach compris), et liste les introuvables. Se combine avec un filtre : `ls air` + colonne |
| `edit ‹dossier› ‹champ› ‹valeur›` | modifie un champ (affect, statut, commune, valo, fci, affectation, relance, commentaire, gcblo) ; dans une fiche ou une liste, double-cliquer une valeur fait la même chose |
| `delete ‹dossiers›` | supprime, après confirmation |
| `attachement fichier` | choisit le classeur d'attachement de référence (gardé dans le navigateur) |
| `attachement ‹dossiers›` | remplit une copie de la référence (X5 commune, AG5 date, U6 GCBLO, paliers 30/60 en lignes 30-31) et l'enregistre en `‹GCBLO›.xlsx` dans le dossier des attachements (choisi une fois, retenu) ; le dossier passe au statut Attach ; le mail au pôle facturation est préparé pour Outlook (voir plus bas) |
| `attachement folder` | change le dossier des attachements |
| `save` · `save folder` | la première fois, choisit un dossier ; ensuite, sauvegarde directement dans ce dossier sans rien redemander (`save folder` pour en changer). Écrit une sauvegarde datée ; seules les 10 plus récentes y restent. Ensuite, sauvegarde automatique toutes les heures dans ce dossier, tant que l'appli est ouverte. Écrit aussi `registre-gcblo.csv` pour le classeur partagé (voir plus bas) |
| `restore` | recharge une sauvegarde : remplace toute la base après confirmation (annulable) |
| `fci ‹dossier› ‹fci›` | met à jour le FCI d'un dossier (raccourci de `edit ‹dossier› fci ‹fci›`) ; `fci ‹dossier› -` l'efface ; `cancel` revient en arrière |
| *(un GCBLO seul)* | coller ou taper un GCBLO sans commande : un seul dossier reconnu → `open`, sinon → `ls` (plusieurs dossiers, colonne collée) |
| `line ‹dossier› [chrome\|mozilla]` | dossier LINE (flashback.orange.fr) du GCBLO : chrome ouvre un onglet ; mozilla ouvre un onglet dans Firefox (réglage `outils/ouvrir-dans-firefox.reg` à installer une fois) et copie aussi le lien. Aussi dans le menu ⋯ (« Accès LINE chrome / mozilla ») |
| `sync [filtres]` · `sync stop` | tournée LINE (extension 1.3) : ouvre en arrière-plan la page LINE de chaque dossier (informations puis documents), met à jour le FCI, passe en Mis à disposition si GCB_1 et GCB_2, referme l'onglet. Sans filtre : dossiers affectés non clos ; filtres comme `ls` (`sync fci-retard`). Bouton « vérifier sur LINE » sur la carte FCI en retard de today |
| `refresh` | recharge la page avec la dernière version publiée (comme Ctrl+F5) ; les dossiers restent |
| `today` | « Aujourd'hui », à l'ouverture : une carte par sujet (FCI en retard, relances, litiges, refusés, écarts d'affect, sans affect) avec tous les dossiers (liste défilable dans la carte) et leur action en un clic ; l'en-tête de la carte ouvre la liste complète |
| `ls … tri:colonne` | trie la liste (`tri:valo`, `tri:valo-` décroissant ; date, affect, gcblo, commune, fci, statut). Ou un clic sur le titre de la colonne (2e clic : sens inverse) |
| `*` | dans `set`, `delete`, `attachement` : tous les dossiers de la liste affichée (ex. `ls litige` puis `set * to annule`, `attachement *`) |
| `affect ‹GCBLO› ‹num21\|air\|sogetrel›` | donne l'affect (crée le dossier s'il n'existe pas) et ouvre le mail d'affectation |
| `relance ‹dossier› ‹fci\|dft›` | ouvre le mail de relance (fci : seulement si le dossier n'a pas de FCI) |
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
js/line.js              lien vers le dossier LINE (région selon les 3 lettres)
js/dossiers-lies.js     dossiers liés (même affaire, autre suffixe) : lecture, total, couleur
js/affects-classeur.js   affect de la colonne I retenu, écarts avec le registre (ls ecart-affect)
js/jarvis/aujourdhui.js  écran « Aujourd'hui » (commande today)
js/info.js               retrouve les dossiers d'une liste collée (ls avec une colonne de GCBLO)
js/sauvegarde.js         nom, contenu et rotation des sauvegardes
js/export-excel.js       registre-gcblo.csv (vers le classeur) · lecture de classeur-gcblo.csv
excel/MajDepuisRegistre.bas  macro VBA du classeur IMMO-COORDI-DISSIM.xlsm
outlook/BrouillonsAttachement.bas  macro Outlook : brouillons des mails d'attachement
js/mails.js              mails d'affectation et de relance (adresses : config.js)
js/coffre.js             garde la référence d'attachement dans le navigateur (IndexedDB)
js/jarvis/grammaire.js   les commandes, sous forme de tableau (vide : en refonte)
js/jarvis/analyse.js     comprend la ligne tapée (ne modifie rien)
js/jarvis/completion.js  propositions, texte grisé, aperçu (ne modifie rien)
js/jarvis/actions.js     exécute une commande via les règles
js/jarvis/menus.js       le menu ⋯ d'un dossier : des commandes écrites à l'avance
js/jarvis/tableau-bord.js le tableau de bord ASCII, toujours visible à droite
js/jarvis/invite.js      l'écran du terminal et le clavier
tests/                   279 tests (classeur d'essai fictif : tests/donnees) : règles, dates, commandes, menu ⋯, collage, relances
```

## Refonte (04/11/2026, à l'essai)

- **Aujourd'hui** (`today`) à l'ouverture : la liste de ce qui demande une action.
- **Tri** par clic sur les titres de colonnes.
- **Sélection multiple** : Ctrl+clic (un par un) ou Maj+clic (une plage) sur les lignes ; une barre d'actions apparaît (statut / affect, attachement, copier les GCBLO, supprimer). Échap ou ✕ désélectionne.
- **Tableau de bord** : sections repliables (clic sur le titre), bloc **synchro** (dernière sauvegarde, dernière macro Excel lue, en couleur selon l'ancienneté).
- **Notifications** : les événements automatiques (sauvegarde, classeur) s'affichent en bas et disparaissent seuls ; les erreurs restent.

Version d'avant la refonte : branche `avant-refonte`.

## Extension « FCI depuis LINE » (sans clic)

Dossier `extension/` (Chrome ou Edge) : dès qu'une page LINE affiche un FCI dans ses commentaires, le registre ouvert est mis à jour tout seul (bulle verte sur la page LINE ; rien si le FCI est déjà connu). Sur l'onglet Documents, une pièce jointe « GCB_1 » et une « GCB_2 » passent le GCBLO en Mis à disposition (seulement depuis un statut ouvert). Installation : décompresser le dossier, `chrome://extensions` › Mode développeur › « Charger l'extension non empaquetée » › choisir le dossier.

**Tournée LINE** (`sync`) : l'extension ouvre elle-même les pages LINE des dossiers, deux à la fois, en arrière-plan, et les referme ; une barre en bas du registre suit l'avancement.

## Favori « FCI → registre »

Sur la page LINE d'un dossier, un favori lit le FCI dans les commentaires (« Num GCBLO : F99496231124 »). Page ouverte depuis le registre (menu ⋯ › Accès LINE chrome) : le FCI est mis à jour directement dans le registre. Sinon, il copie `fci ‹GCBLO› ‹FCI›` : Ctrl+V puis Entrée dans le registre. Installation : ouvrir **https://rezenforge.github.io/Sogetrel/outils/favori-line.html** et glisser le bouton dans la barre de favoris (Chrome et/ou Firefox). Code lisible : `outils/favori-line.js`.

## Dossiers liés

Dans le classeur partagé, un GCBLO (ex. `SBA301460-THF010`) peut avoir d'autres lignes de la même affaire (`SBA301460-ACD010`…), avec leur affect, valo, statut (E) et commentaire (J). À chaque `save`, le registre les lit dans `classeur-gcblo.csv` :

- **colonne LIÉS** des listes : la valo totale des dossiers liés, en couleur selon l'enjeu (rouge = top 10 % du registre, orange = top 30 %) ; survol = détail, clic = la fiche ;
- **fiche** (`open`) : une carte « dossiers liés », du plus gros au plus petit, avec une barre de valo, l'affect, le statut et le commentaire ;
- **today** : la carte « Gros enjeux liés » ;
- **tableau de bord** : « valo travaux » dans valorisation, le total des dossiers liés (hors GCBLO annulés et attachés) ;
- `ls lies` (ceux qui en ont), `tri:lies-` (du plus gros au plus petit), ou un clic sur le titre LIÉS.

La macro doit être à jour (elle envoie maintenant toutes les lignes, pas seulement les GCBLO).

## Mail d'attachement au pôle facturation (Outlook)

Chaque attachement d'un dossier NUM21 ou AIR prépare son mail dans `mails-attachement.csv`, à côté des attachements :

- **À** la boîte BL (LPC ou Aquitaine), **Cc** Romain Boutineau et le partenaire (NUM21 : oelmahdaoui ; AIR : Jérémie Sannier) ;
- objet `ATTACHEMENT GCBLO | ‹GCBLO› | ‹affect›` ;
- « Le GCBLO du dossier en objet a été réalisé et déposé sur le LINE. Vous trouverez en pièce jointe l’attachement pour le compte de NUM21. »

La macro Outlook `BrouillonsAttachement` en fait des **brouillons**, avec ta signature et l'attachement en pièce jointe. Rien n'est envoyé : on relit, on clique sur Envoyer. Les mails traités sont retirés du fichier, donc relancer la macro ne crée pas de doublon.

**Déjà envoyé ?** Avant chaque brouillon, la macro cherche dans ta Boîte de réception et tes Éléments envoyés (sous-dossiers compris, boîtes partagées ouvertes dans Outlook comprises) un mail à `info_lpc_BL` ou `info_aquitaine_BL` avec une pièce jointe au nom du GCBLO, envoyé par toi ou par quelqu'un d'autre. Si elle le trouve, pas de brouillon : elle te dit quand et par qui. `BrouillonsAttachementForcer` saute cette vérification.

**Installer (une fois)** : dans Outlook classique, Alt+F11, *Fichier › Importer un fichier…*, choisir `outlook/BrouillonsAttachement.bas`, puis *Fichier › Enregistrer*. Le module importé s'appelle `RegistreGcbloOutlook` (s'il reste un ancien module `BrouillonsAttachement`, le supprimer : un module du même nom que la macro empêche Outlook de la lancer). **Lancer** : Alt+F8 › `BrouillonsAttachement`. La première fois, elle demande le dossier des attachements ; `ChoisirDossierAttachements` permet d'en changer.

## Classeur partagé IMMO-COORDI-DISSIM.xlsm

Le registre écrit `registre-gcblo.csv` à chaque sauvegarde, et quelques secondes après chaque changement (dès que l'accès au dossier des sauvegardes est accordé). La macro `MajDepuisRegistre` met le classeur à jour depuis ce fichier, sans rien effacer :

- colonne **J** : `Numéro de commande FCI : ‹fci›`, sauf si le FCI s'y trouve déjà (à n'importe quel endroit) ;
- colonne **J**, dossiers **Mis à disposition** (et Attach) : ` / GCBLO OK` juste après le numéro, soit `Numéro de commande FCI : F… / GCBLO OK` (sans FCI ni au registre ni dans J : laissé de côté et signalé) ;
- colonne **E** : `FACTU` pour les dossiers en Attach ;
- à la fin, une fenêtre « Compte rendu » montre ce qui a été fait (vert = modifié, orange = laissé de côté, lien « voir » vers la cellule). Elle se ferme sans demander d'enregistrer.

La relancer ne change rien de plus : un FCI, un `GCBLO OK` et un `FACTU` déjà posés ne sont pas réécrits.

**Installer la macro (une fois)** : dans le classeur, Alt+F11, *Fichier › Importer un fichier…*, choisir `excel/MajDepuisRegistre.bas`, enregistrer. **Lancer** : Alt+F8 › `MajDepuisRegistre`. La première fois, elle demande où est `registre-gcblo.csv` (le dossier des sauvegardes). `ChoisirCsvRegistre` permet d'en changer.

**Écarts d'affect** : l'affect d'un dossier déjà au registre n'est jamais changé par un import ; `ls ecart-affect` (ou « ≠ colonne I » au tableau de bord) liste les dossiers dont l'affect diffère de la colonne I, avec les deux valeurs. On corrige à la main.

**Dans l'autre sens**, la macro écrit aussi `classeur-gcblo.csv` dans le même dossier : les lignes « GCBLO » du classeur ouvert, même non enregistrées. À chaque sauvegarde (manuelle ou toutes les heures), le registre lit ce fichier et crée les nouveaux GCBLO, ou complète ce qui manque. Rien n'est remplacé.
