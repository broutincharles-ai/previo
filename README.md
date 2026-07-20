# Prévio — MVP opérationnel local

Prévio est un prototype fonctionnel d’assistance à la réalisation et au suivi du Document unique d’évaluation des risques professionnels (DUERP) pour les TPE et PME.

Cette version transforme la landing page initiale en un parcours produit complet. Elle fonctionne sans serveur pour permettre des tests utilisateurs immédiats. Elle ne doit pas être présentée comme un service de production tant que l’authentification, la base de données, l’archivage sécurisé et les contrats de traitement des données ne sont pas branchés.

## Démarrer

Le moyen recommandé est de servir le dossier avec un petit serveur local :

```bash
cd previo-mvp-operationnel
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

L’ouverture directe de `index.html` fonctionne généralement aussi, mais certains navigateurs limitent le stockage local ou l’import de fichiers lorsqu’une page est ouverte en `file://`.

## Parcours fonctionnels

- onboarding de l’établissement, du pilote et des unités de travail ;
- six packs sectoriels embarqués : boulangerie, restauration, bureaux, commerce, garage et parcours générique ;
- questionnaire conditionné par l’unité et le secteur ;
- génération déterministe de fiches de risques structurées ;
- cotation explicable : gravité, exposition et maîtrise ;
- registre des risques avec recherche, filtres, édition, validation et suppression ;
- plan d’actions avec responsable, date, budget, ressources, indicateur, preuve et vérification de l’efficacité ;
- journal des changements pouvant déclencher une mise à jour ;
- participants et rôles simulés ;
- revue finale avec contrôles bloquants ;
- création de versions immuables avec empreinte ;
- prévisualisation et impression du DUERP ;
- export CSV du registre et du plan d’actions ;
- sauvegarde et restauration JSON ;
- sauvegarde locale protégée lorsque `localStorage` est indisponible ;
- modales accessibles avec piège de focus et mise en inertie de l’arrière-plan.

## Données et persistance

Le brouillon est enregistré dans `localStorage` sous une clé versionnée. Les versions archivées sont des instantanés distincts dans le même état local. L’utilisateur peut télécharger l’ensemble au format JSON, puis le réimporter.

Ce mécanisme est adapté à une démonstration ou à un pilote monoposte. Il n’apporte pas les garanties nécessaires à une exploitation commerciale : comptes, séparation des clients, contrôle d’accès, sauvegardes, chiffrement, journal d’audit serveur et conservation durable restent à implémenter.

## Moteur d’évaluation

Les référentiels et questions sont définis dans `data.js`. Chaque question peut produire une fiche contenant notamment :

- unité et situation de travail ;
- danger et personnes exposées ;
- gravité, fréquence, niveau de maîtrise ;
- criticité brute et résiduelle ;
- mesures existantes et mesures proposées ;
- source documentaire ;
- niveau de confiance ;
- statut de validation ;
- trace de génération.

Le moteur actuel est déterministe et n’appelle aucun modèle externe. Cela rend les démonstrations reproductibles et permet de valider le modèle produit avant de brancher une IA générative.

## Brancher une IA réelle

Ne placez jamais de clé de fournisseur de modèle dans `app.js` ou dans le navigateur. L’appel doit passer par un serveur qui :

1. authentifie l’organisation et l’utilisateur ;
2. limite les champs transmis au strict nécessaire ;
3. récupère les références autorisées dans une base documentaire ;
4. impose une sortie JSON validée par schéma ;
5. enregistre modèle, version du prompt, sources, horodatage et statut de validation ;
6. refuse ou signale les situations demandant une expertise spécialisée ;
7. empêche l’utilisation des données clients pour l’entraînement lorsque le fournisseur le permet contractuellement.

Le contrat de production proposé est décrit dans `ARCHITECTURE-PRODUCTION.md`.

## Personnalisation

- Identité visuelle : variables CSS au début de `styles.css`.
- Packs métier, questions et sources : `data.js`.
- Logique, state et exports : `app.js`.
- Domaine Plausible : renseigner la métadonnée `plausible-domain` dans `index.html`.
- Mentions légales et confidentialité : remplacer les contenus provisoires des modales avant publication.

## Tests effectués

- validation syntaxique JavaScript avec `node --check` ;
- chargement de l’application sans erreur JavaScript dans Chromium ;
- navigation sur les sept espaces applicatifs ;
- ouverture et fermeture au clavier des modales publiques ;
- création d’une unité et propagation dans l’évaluation et le formulaire d’action ;
- tolérance à l’indisponibilité de `localStorage` ;
- contrôle du maintien du focus dans une modale.

## Limites à ne pas masquer

- pas de comptes ni de gestion multientreprise ;
- pas de synchronisation serveur ni de travail collaboratif réel ;
- pas d’envoi d’e-mail ;
- pas de signature électronique ;
- pas de stockage d’archives répondant à une politique de conservation longue ;
- pas de génération IA distante ;
- packs métier à faire relire et valider par des professionnels compétents ;
- aucune promesse automatique de conformité juridique.

## Structure

```text
previo-mvp-operationnel/
├── index.html
├── styles.css
├── data.js
├── app.js
├── favicon.svg
├── og-preview.png
├── README.md
└── ARCHITECTURE-PRODUCTION.md
```

## Correction de l’affichage des sections de la landing page

La version corrigée garantit que les sections « Fonctionnement », « Bénéfices » et « IA & données » restent visibles même si JavaScript ou `IntersectionObserver` est indisponible. L’animation d’apparition n’est activée qu’après initialisation réussie du script.
