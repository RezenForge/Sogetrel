# Registre GCBLO

Application web mono-fichier (`index.html`) qui remplace le classeur Excel/VBA
« ROBOT_AFFECTATION_NUMERUS21_ET_AIR » pour le suivi des affectations GCBLO
entre trois types : **NUM21**, **AIR** et **Sogetrel**.

## Utilisation

1. Ouvrir `index.html` dans Edge ou Chrome (double-clic, aucun serveur nécessaire).
2. **Importer Excel** : choisir l'ancien classeur robot (`.xlsx`, `.xlsm` ou `.xls`).
   Les colonnes `GCBLO NUM21 / FCI` et `GCBLO AIR / FCI` sont reconnues
   automatiquement, de même qu'un tableau classique `GCBLO / FCI / Catégorie`.
3. Les données sont enregistrées automatiquement dans le navigateur (localStorage).
   Faire régulièrement **Exporter → Sauvegarde JSON** : vider le cache du navigateur
   efface les données.

Raccourcis : `N` nouveau dossier · `/` recherche · `J` ou `Ctrl+K` Jarvis · double-clic sur une ligne = préparer la relance.

### Jarvis

Ligne de commande en bas du registre : on écrit (ou on dicte avec le micro) ce qu'on veut faire, en français.

| Exemple | Effet |
| --- | --- |
| `ajoute SBA202020-THF010 AIR fci F12345678901` | crée le dossier (demande le type s'il manque) |
| `supprime 501404` | demande confirmation puis supprime |
| `passe 501404 en cours de validation` · `passe-le en refusé` | change le statut DFT |
| `passe 501404 en Sogetrel` | change le type |
| `relance 501404` · `relance 501404 lundi` / `dans 3 jours` | prépare l'email · planifie la relance |
| `ajoute le fci F… à 501404` · `note sur 501404 : texte` | complète le dossier |
| `montre les dossiers air` · `en retard` · `sans fci` · `tout afficher` | filtre le registre |
| `combien de refusés ?` · `stats` · `exporte en excel` · `mode sombre` · `annule` · `aide` | divers |

C'est un interpréteur de mots-clés intégré (pas d'IA en ligne) : il fonctionne hors connexion et rien ne quitte le navigateur. Le micro et la voix dépendent du navigateur (Chrome, Edge, Safari ; le micro demande une page en https, par exemple GitHub Pages).

## Fonctionnalités

- Tableau de bord (NUM21, AIR, Sogetrel, total, relances en retard, sans FCI). Cliquer sur une carte filtre le tableau.
- Tableau triable et filtrable (recherche libre, type, statut DFT), statut DFT modifiable directement dans la ligne.
- Statuts DFT : À faire, En cours de validation, Mis à disposition, Refusé. « Mis à disposition » clôt le dossier (plus d'alerte de relance).
- Création / modification avec validation du format GCBLO et FCI, refus des doublons.
- Relance par email Outlook (lien `mailto`), destinataire et Cc réglables dans les paramètres.
- Lignes en rouge si la relance est dépassée, en orange si elle tombe dans les 3 jours.
- Historique par dossier : création, modifications, relances préparées.
- Exports Excel, CSV (séparateur `;`) et sauvegarde / restauration JSON.
- Habillage « donjon 2D » en pixel art (thèmes Donjon et Parchemin), purement visuel.
- Écran unique : sur téléphone la page ne défile pas, seule la liste des dossiers défile ; un appui sur un dossier affiche ses actions.
- Jauges des statuts DFT (fenêtre « Stats » sur téléphone).
- Animations pixel : à la création, trois petits bâtisseurs construisent la ligne ; à la suppression, les lignes du dessus tombent et l'écrasent. Remplacées par un simple fondu si le système demande moins d'animations.
- Mise en page : colonne latérale à partir de 1440 px ; en dessous, compteurs en bandeau et actions en bas d'écran.

## Dépendances

SheetJS 0.18.5 (CDN) pour l'import/export Excel, polices Pixelify Sans et VT323 (Google Fonts).
Sans connexion, l'app reste utilisable : seul l'Excel est désactivé (CSV et JSON fonctionnent) et les polices retombent sur une police système.

## Architecture

Le script est découpé en couches commentées :

| Couche | Rôle |
| --- | --- |
| `CONFIG` | Référentiels : catégories, statuts, modèles d'emails, règles, interrupteurs de fonctionnalités |
| `DATA LAYER` | `StorageAdapter`, `Migrations`, `DossierRepository`, `SettingsStore` |
| `BUSINESS LAYER` | `DossierService`, `MailService`, `ImportService`, `ExportService`, `CommandService` (analyse des phrases de Jarvis) |
| `UI LAYER` | Icônes pixel, vues (compteurs, jauges, registre), animations, `Jarvis`, dialogues, contrôleur `App` |

### Évolutions prévues

- **Commandes simples / complexes** : ajouter une entrée dans `CATEGORIES` et ses deux couleurs CSS.
- **Priorité** : champ `priorite` déjà présent dans le modèle, à activer via `FEATURES.priorite`.
- **Historique des relances** : déjà enregistré dans `dossier.relances`.
- **Templates d'emails multiples** : ajouter des entrées dans `EMAIL_TEMPLATES` ; un sélecteur apparaît dans la fiche.
- **Export PDF** : prévoir un `ExportService.toPdf()`.
- **Microsoft Graph** : remplacer `StorageAdapter` (SharePoint / OneDrive) et `MailService.prepareRelance` (envoi direct).
- Changement du format des données : incrémenter `APP.schemaVersion` et ajouter l'étape dans `Migrations.run`.
- Données enregistrées avec l'ancienne version (statuts À traiter, En cours, Relancé, Terminé, Bloqué) : converties automatiquement au premier chargement (`LEGACY_STATUS`).
