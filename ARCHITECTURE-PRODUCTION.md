# Prévio — architecture de passage en production

Ce document décrit le socle nécessaire pour transformer le MVP local en service commercial sécurisé et multi-utilisateur.

## 1. Architecture cible

- application web : Next.js, Nuxt ou une SPA équivalente ;
- API serveur : TypeScript avec validation stricte des entrées ;
- base relationnelle : PostgreSQL ;
- documents et preuves : stockage objet chiffré situé dans l’Union européenne ;
- authentification : fournisseur éprouvé avec MFA optionnelle ;
- tâches longues : file de travaux pour génération de documents, analyses et notifications ;
- observabilité : erreurs, métriques, logs techniques et alertes ;
- environnements séparés : développement, préproduction et production.

## 2. Entités principales

### Organisation

- identifiant, raison sociale, SIRET, établissement, effectif, secteur ;
- régime de programme de prévention selon l’effectif ;
- SPST, présence du CSE, paramètres de conservation.

### Utilisateur et appartenance

- utilisateur ;
- organisation ;
- rôle : administrateur, pilote, contributeur, relecteur, lecteur ;
- périmètre éventuel par unité de travail ;
- statut et historique d’invitation.

### Campagne d’évaluation

- période, état, auteur, motif ;
- unités de travail ;
- réponses et observations ;
- participants ;
- contrôles de complétude.

### Risque

- unité, danger, situation, personnes exposées ;
- gravité, exposition, maîtrise, scores ;
- mesures existantes ;
- propositions et sources ;
- confiance, validation, auteur, horodatage ;
- trace de l’assistant.

### Action

- risque et unité ;
- mesure, priorité, responsable, date cible ;
- budget, moyens, effort estimé, dépendances et capacité hebdomadaire ;
- acceptation, blocage, commentaires et notifications ;
- situation de référence, indicateur, preuve, mesure après action et nouvelle cotation ;
- statut, conclusion d’efficacité et prochaine réévaluation ;
- historique des changements.

### Escalade

- risque déclencheur et règle appliquée ;
- urgence, interlocuteur recommandé et motif ;
- mesure conservatoire et informations à préparer ;
- action liée, prise en charge et clôture documentée.

### Version DUERP

- numéro, motif, auteur, date ;
- instantané immuable ;
- empreinte et métadonnées d’export ;
- liens vers les pièces et preuves ;
- aucune suppression silencieuse.

### Événement de mise à jour

- type, date, description, unité ;
- analyse de l’impact ;
- campagne ou version déclenchée ;
- statut de traitement.

## 3. API minimale

```text
POST   /api/auth/session
GET    /api/me
GET    /api/organizations/:organizationId
PATCH  /api/organizations/:organizationId

GET    /api/organizations/:organizationId/units
POST   /api/organizations/:organizationId/units
PATCH  /api/units/:unitId
DELETE /api/units/:unitId

GET    /api/campaigns/:campaignId
POST   /api/organizations/:organizationId/campaigns
PATCH  /api/campaigns/:campaignId/responses
POST   /api/campaigns/:campaignId/analyse

GET    /api/campaigns/:campaignId/risks
POST   /api/campaigns/:campaignId/risks
PATCH  /api/risks/:riskId

GET    /api/organizations/:organizationId/actions
POST   /api/organizations/:organizationId/actions
PATCH  /api/actions/:actionId

POST   /api/organizations/:organizationId/events
POST   /api/campaigns/:campaignId/review
POST   /api/campaigns/:campaignId/versions
GET    /api/versions/:versionId/export.pdf
GET    /api/organizations/:organizationId/export.json
```

Chaque route de mutation doit vérifier l’organisation, le rôle, la version concurrente et écrire dans le journal d’audit.

## 4. Adaptateur IA

L’assistant ne doit jamais écrire directement dans le registre validé. Le flux recommandé est :

1. normalisation des réponses ;
2. détection déterministe des obligations et cas bloquants ;
3. recherche de passages dans un corpus documentaire approuvé ;
4. génération d’une proposition structurée ;
5. validation JSON par schéma ;
6. contrôles de cohérence ;
7. présentation comme proposition ;
8. validation, modification ou rejet par l’utilisateur ;
9. enregistrement complet de la trace.

Exemple de réponse serveur :

```json
{
  "risk": {
    "title": "Manutention manuelle",
    "danger": "Charges et efforts",
    "situation": "Port de sacs depuis le stockage",
    "severity": 3,
    "frequency": 3,
    "control": 2,
    "existingMeasures": [],
    "proposedMeasures": []
  },
  "sources": [
    {"documentId": "inrs-ed-xxx", "passageId": "p-42"}
  ],
  "confidence": 0.78,
  "needsSpecialist": false,
  "trace": {
    "model": "provider/model-version",
    "promptVersion": "risk-analysis-v1",
    "generatedAt": "ISO-8601"
  }
}
```

## 5. Contrôles de sécurité

- chiffrement TLS et chiffrement des sauvegardes ;
- mots de passe non gérés directement si un fournisseur d’identité est utilisé ;
- MFA pour les administrateurs ;
- séparation stricte des organisations au niveau base et API ;
- contrôle d’accès sur chaque objet ;
- protection CSRF, XSS, injection et téléversements malveillants ;
- limitation de débit ;
- rotation des secrets ;
- sauvegardes testées et procédure de restauration ;
- journal d’audit non modifiable par les utilisateurs ordinaires ;
- analyse des dépendances et mises à jour de sécurité ;
- procédure de gestion des incidents.

## 6. RGPD et gouvernance

Avant le lancement :

- cartographier les données et finalités ;
- décider des rôles responsable de traitement / sous-traitant ;
- conclure les accords de sous-traitance ;
- inventorier les sous-traitants ultérieurs ;
- définir les durées de conservation ;
- prévoir export, rectification, suppression et clôture de compte ;
- empêcher la saisie inutile de données médicales ou nominatives sur les salariés ;
- documenter les transferts éventuels hors UE ;
- conduire une analyse de risques et déterminer si une AIPD est nécessaire ;
- publier une politique de confidentialité exacte ;
- former les personnes qui administrent l’assistant.

## 7. Archivage et versions

Le stockage de production doit distinguer :

- le brouillon modifiable ;
- les versions archivées immuables ;
- les pièces justificatives ;
- les exports remis au client ;
- les sauvegardes techniques.

Une résiliation doit déclencher un export complet et une politique documentée de suppression, sans faire disparaître silencieusement les archives dont l’employeur doit assurer la conservation.

## 8. Déploiement recommandé par phases

### Phase pilote

- cinq secteurs validés ;
- comptes simples ;
- une organisation par client ;
- base PostgreSQL ;
- exports PDF/JSON ;
- journal d’audit ;
- moteur déterministe ;
- support manuel des clients pilotes.

### Phase bêta payante

- collaboration réelle ;
- notifications ;
- stockage de preuves ;
- bibliothèque de mesures administrable ;
- analyse IA contrainte ;
- tests d’intrusion et revue juridique ;
- sauvegardes et plan de reprise.

### Phase de généralisation

- nouveaux packs sectoriels validés ;
- intégrations partenaires ;
- SSO et gestion avancée des rôles ;
- tableaux de bord multi-établissements ;
- suivi de la qualité du moteur et des erreurs ;
- gouvernance éditoriale et cycle de mise à jour des référentiels.
