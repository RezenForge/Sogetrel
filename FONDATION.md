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
| `dateAffectation` (« date ») | date ou vide | aujourd'hui par défaut ; vide à l'import ; mise au jour même par `affect` |
| `dateRelance` | date ou vide | facultative |
| `statutDft` | voir ci-dessous | `A_FAIRE` par défaut |
| `type` (affect) | `NUM21`, `AIR`, `SOGETREL`, ou vide | vide possible depuis le 04/11/2026 : import sans affect, ou création par `affect` ; commande `affect` pour le donner |
| `commune` | ex. `Mérignac` | facultative ; reprise de l'import (colonne G) |
| `valorisation` | montant en euros, ex. `1250.5` | facultative ; reprise de l'import (colonne H) ; servira à la commande `attachement` |
| `commentaire` | texte libre | facultatif |
| `historique` | liste de `{ date, action, détail }` | rempli automatiquement à chaque changement |
| `creeLe`, `modifieLe` | date et heure | automatiques |

### Statuts DFT

| Code | Libellé | Couleur (Terminal) | Clôt le dossier ? |
| --- | --- | --- | --- |
| `A_FAIRE` | À faire | gris clair | non |
| `EN_VALIDATION` | En cours de validation | cyan | non |
| `ATTENTE_TRAVAUX` | Attente travaux (`attente-travaux`, `attente`, `travaux`) | violet clair | non |
| `MAD` | Mis à disposition | vert | **oui** |
| `REFUSE` | Refusé | rouge | non (à reprendre) |
| `LITIGE` | Litige | orange | non (à suivre) |
| `ANNULE` | Annulé | gris | oui |
| `ATTACH` | Attach | vert ; **toute la ligne** de la liste en vert clair | oui (attachement fait) |

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
10. **Import Excel** (commande `import`) : on choisit un classeur (.xlsx ou .xlsm). Dans les onglets **33, 16, 17, 79 et 86**, chaque ligne dont la **colonne E** vaut `GCBLO` donne un dossier : son GCBLO est en **colonne D**, sa **commune en G**, sa **valorisation en H** (euros, nombre ou texte « 1 234,56 € »), son type (NUM21, AIR, Sogetrel) en **colonne I**, son FCI est ce qui suit `Numéro de commande FCI :` dans la **colonne J**.
    - Si l'affect est vide ou non reconnu, le dossier est **créé sans affect** (aucune question) ; `ls sans-affect` les retrouve, `affect ‹GCBLO› ‹affect›` le donne. L'affect d'un dossier déjà présent n'est pas changé.
    - Un dossier déjà présent n'est pas recréé : on **complète** ce qui manque (FCI absent, commune ou valorisation vides), on ne remplace rien.
    - Les lignes refusées (GCBLO mal formé, FCI ou valorisation non reconnus) sont listées avec leur onglet et leur numéro de ligne.
    - Tout l'import s'annule d'un coup (`cancel`).
    - Le fichier est lu dans le navigateur : il n'est envoyé nulle part. Onglets, colonnes et texte repère sont réglés dans `config.js` (`IMPORT_EXCEL`).
11. **Attachement** (commande `attachement`) :
    - `attachement fichier` : on choisit le classeur d'attachement **de référence** (.xlsx ou .xlsm). Il est gardé dans le navigateur (IndexedDB) et resservira à chaque attachement, jusqu'au prochain `attachement fichier`.
    - `attachement ‹dossier›` : une copie de la référence est remplie, sur sa **première feuille** : **X5** = commune du dossier, **AG5** = date du jour (format date si la cellule en a un), **U6** = GCBLO.
    - Selon la **valorisation**, le palier le plus proche est coché : proche de **30** → `ANNEX` en A30 et `1` en AB30 ; proche de **60** → en plus `BLOCS` en A31 et `1` en AB31. « Proche » = à 15 au plus du palier (réglable). Sans valorisation, ou trop loin des deux paliers, les lignes 30-31 restent vides et c'est signalé.
    - **En série** : `attachement *` (la liste affichée), `attachement ‹statut›` (tous les dossiers de ce statut) ou plusieurs dossiers : après confirmation, on choisit **un dossier de destination** et tous les fichiers y sont écrits (un fichier du même nom est remplacé). Les dossiers à vérifier (commune ou valorisation manquante, aucun palier) sont listés ; tous passent en Attach en une seule modification (un seul `cancel`).
    - L'explorateur de fichiers s'ouvre pour choisir **où enregistrer** le fichier, nommé `‹GCBLO›.xlsx` (ou `.xlsm` si la référence contient des macros). Les navigateurs qui ne savent pas ouvrir cet explorateur (téléphones, Firefox) le téléchargent.
    - Le reste du classeur (mise en forme, formules, macros) n'est pas touché ; Excel recalcule les formules à l'ouverture. Une ligne « Attachement créé » s'ajoute à l'historique du dossier, et le dossier **passe au statut Attach** (annulable avec `cancel` ; rien ne change si l'enregistrement est abandonné).
    - Cellules et paliers sont réglés dans `config.js` (`ATTACHEMENT`).

12. **Mails d'affectation et de relance** (`js/mails.js`, adresses dans `config.js` → `MAILS`) :
    - `affect ‹GCBLO› ‹num21|air|sogetrel›` : donne l'affect au dossier (le **crée** s'il n'existe pas ; date d'affectation = le jour même quand l'affect change), puis **ouvre le mail** dans la messagerie. Pas de mail pour Sogetrel.
    - `relance ‹dossier› fci` : mail de relance pour le numéro de commande, **seulement si le dossier n'a pas de FCI**. `relance ‹dossier› dft` : mail de relance DFT (docs GCB1 et GCB2 sur le LINE).
    - **Destinataires** : NUM21 → oelmahdaoui, azaamoun, lsettar (@numerus21.fr) ; AIR → jeremie-sannier@air-reseaux.com ; **plus la boîte BL** selon les 3 premières lettres du GCBLO : SBA, LRO, POI, ANG, NIO → info_lpc_BL@sogetrel.fr (mention `@info_lpc_BL`) ; MED, BOR, EST, LIB, ARC → info_aquitaine_BL@sogetrel.fr (mention `@info_aquitaine_BL`) ; autre début : pas de boîte BL, c'est signalé. **Copie** : Romain.BOUTINEAU@sogetrel.fr.
    - **Objets** : `Affectation GCBLO ‹affect› | ‹GCBLO›`, `Relance GCBLO ‹affect› | ‹GCBLO›`, `Relance GCBLO DFT ‹affect› | ‹GCBLO›`. Les textes sont dans `js/mails.js` (vouvoiement pour NUM21, tutoiement « Jérémie » pour AIR).
    - **Pas de doublon** : si la même relance (FCI ou DFT) a déjà été préparée aujourd'hui ou hier (`RELANCE_INTERVALLE_JOURS` = 2), le registre demande « déjà préparée … : relancer quand même ? [o/n] ». Non → rien n'est envoyé. Chaque motif est compté à part (une relance FCI ne bloque pas une DFT).
    - Le volet résume le mail (lien pour le rouvrir, destinataires, copie) ; l'historique du dossier note « Mail d'affectation préparé » ou « Relance FCI/DFT préparée ». L'envoi reste fait à la main dans la messagerie.

13. **FCI attendu** : un dossier **affecté** (affect et date) qui n'a **toujours pas de FCI 24 h après sa date** (le lendemain) et n'est pas clos voit sa case FCI passer en **rouge clair** (liste et fiche). `ls fci-retard` les liste ; c'est le moment d'un `relance ‹dossier› fci` : un **clic droit sur la case rouge** le lance. Après une relance FCI (clic droit ou commande), la case passe en **orange pendant 2 jours** (le jour de la relance et le lendemain), puis redevient rouge si le FCI n'est toujours pas arrivé (`FCI_RELANCE_JOURS`). La date de relance est lue dans l'historique du dossier. Délai réglable : `FCI_ATTENDU_JOURS` dans `config.js`.

14. **Classeur partagé (IMMO-COORDI-DISSIM.xlsm)** : à chaque sauvegarde (commande `sauvegarde` ou automatique toutes les heures), le registre écrit aussi **`registre-gcblo.csv`** dans le même dossier, toujours sous ce nom (remplacé à chaque fois, hors rotation). UTF-8 avec BOM, séparateur `;`, en-têtes `GCBLO;AFFECT;STATUT DFT;CODE STATUT;FCI;COMMUNE;VALO;DATE;MODIFIE LE`, plusieurs FCI séparés par un espace (`js/export-excel.js`).
    La macro **`MajDepuisRegistre`** (`excel/MajDepuisRegistre.bas`), lancée dans le classeur (Alt+F8), lit ce CSV et, sur les onglets 33, 16, 17, 79, 86, pour chaque ligne dont D est un GCBLO du registre et E vaut `GCBLO` (ou déjà `FACTU`) :
    - **J** : `Numéro de commande FCI : ‹fci›`. Registre sans FCI → rien. un des FCI du registre se trouve déjà n'importe où dans J → rien (un dossier sur plusieurs lignes garde un FCI par ligne). Sinon le texte après la mention est remplacé, ou la mention est ajoutée à la fin ; le reste de J est gardé.
    - **E** : `FACTU` pour les dossiers **Attach** (seulement si E vaut `GCBLO`).
    - Rien n'est effacé ; une cellule à formule ou protégée est laissée et signalée. À la fin, une **fenêtre de compte rendu** (classeur temporaire, jamais enregistré) liste ce qui a été fait : vert = modifié, orange = laissé de côté avec la raison, lien « voir » vers la cellule ; si rien n'a changé, un simple message « Tout est déjà à jour ». Le chemin du CSV est demandé la première fois et gardé sur le PC (pas dans le classeur). **Relancer la macro ne change rien de plus** : un FCI déjà présent et un `FACTU` déjà posé ne sont pas réécrits (« Tout est déjà à jour »).
    **Écarts d'affect** : l'affect d'un dossier existant n'est jamais changé par un import. Mais à chaque import (`import` ou `classeur-gcblo.csv`), le registre retient la colonne I de chaque GCBLO (`js/affects-classeur.js`, dans le navigateur, hors sauvegarde). `ls ecart-affect` liste les dossiers dont l'affect diffère (colonne I lisible et différente, ou plusieurs lignes qui se contredisent) et, pour chacun, « registre X · colonne I Y » ; correction à la main (double-clic). Colonne I vide, ou autre entreprise quand le registre est sans affect : pas d'écart. Le tableau de bord affiche « ≠ colonne I » (cliquable) s'il y en a.
    **Dans l'autre sens**, la macro écrit aussi **`classeur-gcblo.csv`** dans le même dossier : les lignes dont E vaut `GCBLO` sur les 5 onglets, lues dans le classeur **ouvert** (même ce qui n'est pas encore enregistré) — en-têtes `ONGLET;LIGNE;DOSSIER;COLONNE E;AFFECT;COMMUNE;VALO;COLONNE J`. À chaque sauvegarde (manuelle ou automatique), **avant** d'écrire, le registre lit ce fichier s'il est là et le traite exactement comme `import` (R10) : nouveaux GCBLO créés, ce qui manque complété, rien de remplacé. Le volet l'indique (« classeur partagé : N nouveaux GCBLO »). Un dossier supprimé du registre mais encore en `GCBLO` dans le classeur revient à la sauvegarde suivante. La commande `import` reste possible. Les lignes passées en `FACTU` ne sont plus relues par `import` : ces dossiers sont déjà au registre.

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
  xlsx.js                  lit un classeur Excel (.xlsx, .xlsm) et en écrit une copie modifiée, sans bibliothèque
  import-excel.js          R10 : quels dossiers et FCI prendre dans le classeur
  attachement.js           R11 : quelles cellules remplir pour un dossier
  info.js                  retrouve les dossiers d'une liste collée (ls avec une colonne de GCBLO)
  sauvegarde.js            nom, contenu et rotation des sauvegardes (3 gardées)
  mails.js                 R12 : mails d'affectation et de relance (destinataires, objet, texte, lien mailto)
  export-excel.js          R14 : registre-gcblo.csv (vers le classeur) et lecture de classeur-gcblo.csv (depuis le classeur)
  coffre.js                garde des fichiers dans le navigateur (IndexedDB) : la référence d'attachement
  ui/
    registre.js            la liste des dossiers
    filtres.js             recherche, filtres, tri, compteurs
    fiche.js               fenêtre détail et formulaire
  jarvis/
    grammaire.js           les commandes et leurs emplacements, sous forme de tableau
    analyse.js             texte tapé → commande comprise + ce qui manque (ne modifie rien)
    completion.js          propositions classées, texte fantôme, aperçu de l'effet
    actions.js             commande validée → appel aux règles de dossiers.js
    menus.js               le menu ⋯ d'un dossier : des commandes écrites à l'avance
    tableau-bord.js        le tableau de bord ASCII, à droite de la console
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

**03/11/2026 : toutes les commandes ont été retirées pour être refaites une par une.** L'écran de départ est vide (plus de titre ni de message d'accueil). Le moteur reste en place : découpage des mots, lecture des dossiers, des dates, des statuts et des types, autocomplétion, couleurs, questions oui/non. Les données et leurs règles (§2, §3) ne changent pas. L'ancienne liste de commandes, avec `meteo`, `wiki` et `stats` en ASCII, est gardée dans la branche `v2-commandes`.

Chaque commande commence par un verbe, suivi d'**emplacements** à remplir dans l'ordre. Les mots entre `‹ ›` sont proposés automatiquement. Pour en ajouter une : une ligne dans `grammaire.js` (elle est alors comprise et proposée), puis sa fonction dans `actions.js`, puis ses tests.

| Commande | Forme | Exemple |
| --- | --- | --- |
| Afficher | les dossiers **Attach** n'apparaissent que si on les demande (`ls attach`) ; `ls [affects…] [statuts…] [dates…] [retard\|proches] [sans-fci] [sans-valo] [sans-affect] [texte]` (aussi `list`) ; plusieurs affects, statuts ou dates = l'un ou l'autre ; date affect : `12/03` (jour, année en cours), `12/03/2026`, `03/2026` (mois) | `ls num21 sogetrel litige`, `ls 03/2026` |
| Ouvrir | `open ‹dossier›` | `open 501404` |
| Changer le statut ou le type | `set ‹dossiers› to ‹statut\|type›` | `set 501404 to refuse` |
| Liste collée | `ls ‹GCBLO…›` : dès qu'il y a **au moins deux GCBLO** (complets ou débuts, `SBA501023`), c'est une liste collée : dossiers trouvés dans l'ordre collé (éditables, Attach compris), puis les introuvables ; les autres filtres s'ajoutent (`ls air` + colonne). Un seul GCBLO : `ls` habituel. (Remplace l'ancienne commande `info`.) | `ls ` + Ctrl+V |
| Modifier un champ | `edit ‹dossier› ‹champ› ‹valeur›` ; champs : affect, statut, commune, valo, fci, affectation, relance, commentaire, gcblo ; `-` vide un champ facultatif | `edit 501404 commune Le Haillan` |
| Supprimer | `delete ‹dossiers›` (aussi `rm`), confirmation demandée | `delete 501404` |
| Annuler | `cancel` (aussi `undo`) : défait la dernière modification | `cancel` |
| Importer | `import` : ouvre l'explorateur de fichiers, lit un classeur Excel (R10) | `import` |
| Attachement | `attachement fichier` (choisir la référence) · `attachement ‹dossiers›` (créer, R11) ; plusieurs dossiers (`*`, un statut, une liste) : un dossier de destination pour tous les fichiers, confirmation | `attachement 501404`, `attachement *`, `attachement mis-a-dispo` |
| Sauvegarder | `sauvegarde` : la première fois, choisir un dossier ; ensuite, directement dans ce dossier (le navigateur peut seulement redemander « Autoriser » après une fermeture) ; `sauvegarde dossier` pour en changer ; fichier `gcblo-sauvegarde_AAAA-MM-JJ_HHhMM-SS.json` ; seules les **10 plus récentes** y restent (les plus anciennes sont supprimées, les autres fichiers jamais touchés) | `sauvegarde`, `sauvegarde dossier` |
| Restaurer | `restore` : choisir une sauvegarde (l'explorateur s'ouvre dans le dossier des sauvegardes) ; remplace toute la base après confirmation ; annulable (`cancel`) ; les dossiers illisibles ou en double sont ignorés | `restore` |
| Affecter (mail) | `affect ‹GCBLO› ‹num21\|air\|sogetrel›` : affect donné (dossier créé s'il n'existe pas) et mail d'affectation ouvert (R12) | `affect SBA501404-THF010 num21` |
| Relancer (mail) | `relance ‹dossier› ‹fci\|dft›` : mail de relance ouvert (fci seulement sans FCI) (R12) | `relance 501404 dft` |
| Vider l'écran | `clear` | `clear` |
| Aide | `help [commande]` (aussi `?`) ; chaque commande de la liste est cliquable | `help set` |

**Langue** (03/11/2026) : les **verbes et le mot de liaison sont en anglais** (`open`, `set … to …`), les **valeurs métier restent en français** (`refuse`, `mis-a-dispo`, `air`), comme les messages affichés.

### Console + clics : un clic = une commande

Ce que la console affiche est cliquable, pour le quotidien, mais **un clic ne fait rien de plus qu'une commande** : il écrit la commande dans la console et l'exécute, exactement comme si on l'avait tapée.

- Un seul chemin dans le code : chaque action existe une fois, dans `actions.js`.
- `cancel` et l'historique (`↑`) marchent aussi pour les clics.
- On apprend les commandes en les voyant passer.

Ce qui est cliquable :
- **le GCBLO** d'un dossier, dans une liste ou une fiche → `open ‹gcblo›` ;
- **`⋯`** à côté d'un dossier → un menu court, construit selon l'état du dossier au moment du clic (`js/jarvis/menus.js`) : Ouvrir, puis les statuts où il peut passer (`→ Refusé`), et Supprimer en dernier (en rouge, avec confirmation). ;
- **une valeur de la fiche** (`open`) **ou d'une liste** (`ls` : affect, commune, valo, FCI, relance, statut), au **double-clic** : elle devient une zone de saisie (une liste pour l'affect et le statut). Entrée ou un clic ailleurs valide, Échap annule. La validation lance `edit ‹gcblo› ‹champ› ‹valeur›` ; la fiche ou la liste se met à jour sur place ;
- **`cancel`** dans le message qui suit une modification ;
- **clic droit sur un GCBLO ou un FCI** (liste, fiche) → copie dans le presse-papiers (tous les FCI du dossier, séparés par une espace), avec une bulle « copié ». Ce n'est pas une commande : rien ne change dans les données ;
- **les libellés du tableau de bord** (nombre de dossiers, affects, statuts, attaché, sans valo, en retard, sous 3 jours, sans FCI) → `ls` filtré sur ce qu'ils désignent ;
- **chaque commande** dans la liste de `help` → `help ‹commande›`.

**Vues à jour** (04/11/2026, remplace le grisé) : quand un dossier change, les listes et fiches déjà affichées se mettent à jour sur place (mêmes dossiers, même ordre). Un dossier supprimé disparaît des listes ; sa fiche passe en grisé.

**Sauvegarde** (04/11/2026) : les dossiers n'existent que dans le navigateur ; `sauvegarde` en écrit une copie dans un dossier choisi (Chrome, Edge ; ailleurs, téléchargement). Le tableau de bord affiche la date de la dernière sauvegarde (rouge au-delà de 7 jours, cliquable). **Sauvegarde automatique toutes les heureseures** (`SAUVEGARDE_AUTO_HEURES`), tant que l'appli est ouverte, dans le dernier dossier choisi avec `sauvegarde` (retenu dans le navigateur). Si le navigateur redemande l'autorisation d'écrire dans ce dossier (après une fermeture, par exemple), un message cliquable le signale une fois dans le volet : un clic sur `sauvegarde` suffit (petite question « Autoriser » du navigateur, pas d'explorateur).

**`*` = la liste affichée** (04/11/2026) : partout où plusieurs dossiers sont permis (`set`, `delete`, `attachement`), `*` désigne tous les dossiers de la dernière liste affichée dans la console (`ls`, `info`), comme le `*` des terminaux. Exemple : `ls litige` puis `set * to annule` (confirmation au-delà de 3 dossiers).

**Console vidée** (04/11/2026) : `ls` (`list`) vide la console, qui ne montre que la liste et son bilan ; la commande elle-même s'écrit dans le volet de droite, comme les autres (même lancée d'un clic sur le tableau de bord). Sans aucun résultat, tout s'affiche dans le volet et la liste déjà affichée reste en place.

**Volet de droite** (04/11/2026) : `open`, `set`, `edit` (donc le double-clic), `cancel`, `help`, `sauvegarde`, `restore`, `attachement` et `delete` s'affichent, ainsi que toute commande inconnue ou incomplète (message d'erreur), sous le tableau de bord, dans un volet qui défile seul ; la console ne bouge pas.

Pas de barre d'outils fixe : les clics restent à l'intérieur de ce que la console affiche.

**Écran** (04/11/2026) : pour ordinateur seulement. À gauche la console ; à droite, toujours visible, le **tableau de bord** dessiné en caractères (affect, avec « - » pour les dossiers sans affect ; statut DFT, avancement, valorisation, sauvegarde), redessiné à chaque changement de dossier et chaque minute.

**Textes courts** (03/11/2026) : la console n'explique pas ce que fait chaque chose. Pas de phrase d'aide sous les résultats, des libellés de quelques mots (`6 dossiers`, `annulé : 1 modification`), une aide (`help`) en une ligne par commande. Le détail reste dans ce document.

Les **sortes de valeurs** que le moteur sait déjà lire, utilisables dans les nouvelles commandes : `dossier` (GCBLO complet ou morceau ; groupes `retard` et `proches` là où plusieurs sont permis), `nouveau-gcblo`, `type`, `statut-ou-type`, `filtre`, `date` (`demain`, `lundi`, `+3`, `12/11`), `fci`, `adresse`, `ville`, `periode`, `texte`, `commande`.

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
- **Aperçu** : en gris sur la ligne de saisie elle-même, après le texte tapé (la zone de saisie tient sur une seule ligne), par exemple `→ SBA501404-THF010 : À faire → Refusé` ou `→ 3 dossiers supprimés (confirmation demandée)`.
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

Jarvis est un **interpréteur intégré, pas une IA en ligne** : il fonctionne hors connexion et rien ne quitte le navigateur. Une commande qui devrait contacter un service extérieur aura son propre module, isolé, et n'enverra jamais de donnée de dossier.

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
- **Style shell Linux**, sobre (pas « hacker ») : fond gris anthracite d'un terminal GNOME, palette Tango, police Ubuntu Mono, pas d'effet lumineux.
- Invite bash classique `dylan@gcblo:~$` (utilisateur@machine en vert, chemin en bleu). La ligne de saisie se fond dans l'écran, sans bandeau.
- Messages comme les outils Linux : un succès s'écrit simplement ; une erreur est préfixée du programme (`gcblo: lsx : commande introuvable`) ; une commande incomplète rappelle son `usage`.
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
| 02/11/2026 | `stats` redessiné en ASCII (`js/jarvis/dessin.js`) ; `statistiques()` compte aussi les relances des 7 prochains jours |
| 03/11/2026 | Page déclarée sombre (`color-scheme`, `darkreader-lock`) pour que le mode sombre forcé des navigateurs ne recolore pas le texte |
| 03/11/2026 | Zone de saisie sur une seule ligne : l'aperçu, les erreurs et les consignes s'affichent en gris après le texte tapé |
| 03/11/2026 | Toutes les commandes retirées pour être refaites (ancienne version : branche `v2-commandes`) ; écran de départ vide ; `meteo.js`, `wiki.js`, `dessin.js` retirés |
| 03/11/2026 | Principe « un clic = une commande » ; commandes `ls`, `ouvre`, `passe`, `annule` ; GCBLO et menu `⋯` cliquables ; listes anciennes grisées |
| 03/11/2026 | Commandes en anglais : `ls`, `open`, `set … to …`, `delete`, `cancel`, `clear`, `help` ; « Supprimer » dans le menu ⋯ |
| 03/11/2026 | Textes de la console raccourcis : plus d'indications à rallonge (résultats, aide, menu ⋯, propositions) |
| 03/11/2026 | Style « shell Linux » au lieu de « hacker » : fond gris de terminal GNOME, palette Tango, police Ubuntu Mono, invite bash `dylan@gcblo:~$`, ligne de saisie fondue dans l'écran, messages façon outils Linux (`gcblo: lsx : commande introuvable`, succès sans ✓) |
| 03/11/2026 | Commande `import` (R10) : classeur Excel lu dans le navigateur, sans bibliothèque extérieure (`js/xlsx.js`) |
| 03/11/2026 | `import` : type lu en colonne I (demandé seulement s'il manque) |
| 03/11/2026 | Dossier : champs `commune` et `valorisation` (import colonnes G et H, fiche, recherche) ; prévus pour la future commande `attachement` |
| 03/11/2026 | Commande `attachement` (R11) : référence gardée dans le navigateur, copie remplie (X5, AG5, U6, paliers 30/60), enregistrée où l'on veut |
| 03/11/2026 | Explorateur de fichiers ouvert après le relâchement d'Entrée, hors de la ligne de saisie (souris cachée sous Windows) |
| 03/11/2026 | À l'écran, « type » devient « affect » (liste, fiche, `set … to ‹statut\|affect›`, import) ; le champ s'appelle toujours `type` dans les données |
| 03/11/2026 | En-tête des listes collé en haut de l'écran pendant le défilement |
| 03/11/2026 | `ls` affiche aussi FCI, commune et valo : en colonnes sur grand écran, sur une seconde ligne sur téléphone |
| 03/11/2026 | Ordre des colonnes de `ls` : AFFECT GCBLO COMMUNE VALO FCI RELANCE STATUT (sur téléphone : commune · valo · FCI en seconde ligne) |
| 03/11/2026 | Commande `edit` ; fiche éditable au double-clic (chaque modification passe par `edit`, annulable) |
| 04/11/2026 | Listes (`ls`) éditables au double-clic, comme la fiche ; la liste se met à jour sur place |
| 04/11/2026 | Commande `info` (`js/info.js`) ; une colonne collée dans la ligne de saisie devient une suite de mots séparés par des espaces |
| 04/11/2026 | `info` : les GCBLO sont cherchés dans tout le texte collé (même recollés bout à bout, tirets variés) ; les mots ignorés sont comptés dans le bilan |
| 04/11/2026 | `info` : un début de GCBLO seul (`SBA501023`) retrouve le dossier complet (fins -THF010, -THF011, -ACF010, -ACF011…) ; plusieurs dossiers possibles → tous affichés |
| 04/11/2026 | Statuts Litige, Annulé (clos) et Attach (clos, ligne en vert clair) ; colonne RELANCE retirée de la liste ; « STATUT » devient « STATUT DFT » |
| 04/11/2026 | `attachement ‹dossier›` : le dossier passe au statut Attach une fois le fichier enregistré |
| 04/11/2026 | Affichage téléphone abandonné (ordinateur seulement) ; tableau de bord ASCII toujours visible à droite (`js/jarvis/tableau-bord.js`) : affect, statut DFT, avancement, valorisation (total, attaché, à attacher), relances ; redessiné à chaque changement |
| 04/11/2026 | Tableau de bord : chaque morceau posé dans une case de largeur fixe, les traits remplissent le reste ; le cadre reste droit quelle que soit la police |
| 04/11/2026 | Volet sous le tableau de bord pour `open`, `set`, `edit`, `cancel` (la console ne défile plus) ; listes et fiches mises à jour sur place au lieu d'être grisées |
| 04/11/2026 | Tableau de bord cliquable : chaque libellé lance `ls` filtré ; nouveaux filtres `proches` et `sans-valo` |
| 04/11/2026 | `help` s'affiche aussi dans le volet de droite |
| 04/11/2026 | `ls`, `list` et `info` vident la console avant d'afficher |
| 04/11/2026 | `ls`/`info` : la ligne de commande va dans le volet ; sans résultat, tout va dans le volet et la console ne change pas |
| 04/11/2026 | Commande `sauvegarde` (`js/sauvegarde.js`) : dossier choisi, nom daté, 3 sauvegardes gardées ; dernière sauvegarde dans le tableau de bord |
| 04/11/2026 | Statut DFT « Attente travaux » (`attente-travaux`) : ouvert, violet clair, « Att. trav. » au tableau de bord |
| 04/11/2026 | Relances FCI et DFT : confirmation si la même relance a déjà été préparée aujourd'hui ou hier |
| 04/11/2026 | Sous une liste, seulement le nombre de dossiers (plus de « N attach masqués » ni de rappel Ctrl+clic) |
| 04/11/2026 | Historique : ↑ ↓ restent dans l'historique tant qu'on n'a rien tapé ; la liste de propositions reste fermée pendant ce temps |
| 04/11/2026 | Correction : un clic sur une ligne ou ⋯ lançait « ls … tri:- » (la liste entière était prise pour un titre de colonne) |
| 04/11/2026 | **Refonte à l'essai** (version d'avant : branche `avant-refonte`) : écran « Aujourd'hui » (`today`, à l'ouverture) ; tri `tri:colonne` et clic sur les titres de colonnes ; sélection multiple (Ctrl+clic, Maj+clic) avec barre d'actions (set, attachement, copier, delete) ; tableau de bord à sections repliables et bloc « synchro » (sauvegarde, macro Excel) ; notifications discrètes pour les événements automatiques |
| 04/11/2026 | Commande `refresh` : recharge la page en redemandant les fichiers au serveur (comme Ctrl+F5) |
| 04/11/2026 | Écarts d'affect avec la colonne I : `ls ecart-affect`, ligne « ≠ colonne I » au tableau de bord ; rien n'est corrigé automatiquement |
| 04/11/2026 | Commande `info` retirée : `ls` reconnaît une colonne de GCBLO collée (au moins deux GCBLO), dans l'ordre collé, introuvables listés, combinable avec les filtres |
| 04/11/2026 | Repère visuel : la ligne qui contient l'élément cliqué est aussi voilée de gris très léger |
| 04/11/2026 | Repère visuel : le dernier élément cliqué (gauche ou droit) — case, lien, morceau du tableau de bord, sinon la ligne — est surligné en bleu clair ; il reste en place quand la vue se redessine |
| 04/11/2026 | Sauvegarde automatique toutes les heures dans le dernier dossier choisi ; autorisation à renouveler signalée dans le volet |
| 04/11/2026 | `backup` retiré (malentendu : c'était `restore`) ; commande `restore` |
| 04/11/2026 | Clic droit sur un GCBLO ou un FCI : copie dans le presse-papiers |
| 04/11/2026 | `ls` : plusieurs affects ou statuts s'ajoutent (`ls num21 sogetrel`, `ls litige attach`) ; catégories différentes combinées (`ls air litige`) |
| 04/11/2026 | `*` = la liste affichée (`set * to annule`) ; attachements en série dans un dossier choisi (`attachement *`, `attachement mis-a-dispo`) ; `attachement` et `delete` dans le volet |
| 04/11/2026 | R12 : commandes `affect` et `relance` (mails préparés, `js/mails.js`) ; dossier sans affect possible (import, `ls sans-affect`) ; menu ⋯ : affecter, relancer |
| 04/11/2026 | Colonne DATE (d'affectation) en tête de liste (jour/mois ; année au double-clic), modifiable ; `affect` la met au jour même (aussi pour un dossier déjà au bon affect mais sans date) ; vide à l'import ; filtres `ls 12/03`, `ls 03/2026` |
| 04/11/2026 | « date affect » renommé « date » (colonne DATE, fiche, `edit ‹dossier› date …`) |
| 04/11/2026 | R13 : case FCI en rouge clair 24 h après la date sans FCI ; `ls fci-retard` ; « FCI > 24 h » au tableau de bord |
| 04/11/2026 | Commande introuvable ou incomplète : le message va dans le volet |
| 04/11/2026 | Clic droit sur une case FCI rouge : `relance ‹gcblo› fci` |
| 04/11/2026 | `ls` masque les dossiers Attach sauf `ls attach` (le bilan indique combien sont masqués) |
| 04/11/2026 | Case FCI orange pendant 2 jours après une relance FCI, puis rouge à nouveau |
| 04/11/2026 | R14 : `registre-gcblo.csv` écrit à chaque sauvegarde ; macro `MajDepuisRegistre` pour IMMO-COORDI-DISSIM.xlsm (J = FCI, E = VALIDÉ GDP pour Attach, journal des changements) |
| 04/11/2026 | Macro : fenêtre de compte rendu à la fin (modifié en vert, laissé de côté en orange, lien vers la cellule) |
| 04/11/2026 | Macro : J n'est pas touché si un FCI du registre s'y trouve déjà, à n'importe quel endroit |
| 04/11/2026 | Sauvegarde automatique toutes les heures ; roulement de 10 sauvegardes (au lieu de 3 h et 3) |
| 04/11/2026 | Tableau de bord : partie « relances » retirée ; ligne « - » dans affect pour les dossiers sans affect (toujours affichée, clic : `ls sans-affect`) |
| 04/11/2026 | Explorateur de fichiers lancé au clavier : bouton « ▸ ouvrir l'explorateur » à cliquer à la souris (sinon Windows cache le pointeur) ; Échap abandonne. Lancé à la souris : ouverture directe |
| 04/11/2026 | `sauvegarde` réutilise le dossier déjà choisi sans ouvrir l'explorateur ; `sauvegarde dossier` pour en changer |
| 04/11/2026 | Les deux sens par un seul dossier : la macro écrit `classeur-gcblo.csv`, le registre le lit à chaque sauvegarde et crée les nouveaux GCBLO |
| 04/11/2026 | Macro : E = `FACTU` (et non VALIDÉ GDP) pour les dossiers Attach ; onglet Journal registre retiré, le compte rendu suffit |
