# Affectations GCBLO

Application web mono-fichier (`index.html`) qui remplace le classeur Excel/VBA
« ROBOT_AFFECTATION_NUMERUS21_ET_AIR » pour le suivi des affectations GCBLO
entre **NUM21** et **AIR**.

## Utilisation

1. Ouvrir `index.html` dans Edge ou Chrome (double-clic, aucun serveur nécessaire).
2. **Importer Excel** : choisir l'ancien classeur robot (`.xlsx`, `.xlsm` ou `.xls`).
   Les colonnes `GCBLO NUM21 / FCI` et `GCBLO AIR / FCI` sont reconnues
   automatiquement, de même qu'un tableau classique `GCBLO / FCI / Catégorie`.
3. Les données sont enregistrées automatiquement dans le navigateur (localStorage).
   Faire régulièrement **Exporter → Sauvegarde JSON** : vider le cache du navigateur
   efface les données.

Raccourcis : `N` nouveau dossier · `/` recherche · double-clic sur une ligne = préparer la relance.

## Fonctionnalités

- Tableau de bord (NUM21, AIR, total, relances en retard, sans FCI). Cliquer sur une carte filtre le tableau.
- Tableau triable et filtrable (recherche libre, catégorie, statut), statut modifiable directement dans la ligne.
- Création / modification avec validation du format GCBLO et FCI, refus des doublons.
- Relance par email Outlook (lien `mailto`), destinataire et Cc réglables dans les paramètres.
- Lignes en rouge si la relance est dépassée, en orange si elle tombe dans les 3 jours.
- Historique par dossier : création, modifications, relances préparées.
- Exports Excel, CSV (séparateur `;`) et sauvegarde / restauration JSON.
- Graphiques de répartition (Chart.js), mode sombre, affichage mobile.

## Dépendances

Chargées depuis un CDN au démarrage : SheetJS 0.18.5 et Chart.js 4.4.1.
Sans connexion, l'app reste utilisable ; seuls l'import/export Excel et les graphiques sont désactivés.

## Architecture

Le script est découpé en couches commentées :

| Couche | Rôle |
| --- | --- |
| `CONFIG` | Référentiels : catégories, statuts, modèles d'emails, règles, interrupteurs de fonctionnalités |
| `DATA LAYER` | `StorageAdapter`, `Migrations`, `DossierRepository`, `SettingsStore` |
| `BUSINESS LAYER` | `DossierService`, `MailService`, `ImportService`, `ExportService` |
| `UI LAYER` | Vues (tableau de bord, tableau, graphiques), dialogues, contrôleur `App` |

### Évolutions prévues

- **Commandes simples / complexes, DFT** : ajouter une entrée dans `CATEGORIES` et ses deux couleurs CSS.
- **Priorité** : champ `priorite` déjà présent dans le modèle, à activer via `FEATURES.priorite`.
- **Historique des relances** : déjà enregistré dans `dossier.relances`.
- **Templates d'emails multiples** : ajouter des entrées dans `EMAIL_TEMPLATES` ; un sélecteur apparaît dans la fiche.
- **Export PDF** : prévoir un `ExportService.toPdf()`.
- **Microsoft Graph** : remplacer `StorageAdapter` (SharePoint / OneDrive) et `MailService.prepareRelance` (envoi direct).
- Changement du format des données : incrémenter `APP.schemaVersion` et ajouter l'étape dans `Migrations.run`.
