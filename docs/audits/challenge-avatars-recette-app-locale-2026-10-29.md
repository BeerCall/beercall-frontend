# Challenge — Recette des avatars dans l'application locale habituelle

- **Date** : 2026-10-29
- **Périmètre** : changement d'ordre explicitement demandé par l'utilisateur ; T08–T12 puis accès aux vrais parcours locaux, sans production.
- **Hors périmètre** : publication, backend, données métier, assouplissement des tests ou validation matérielle anticipée.
- **Méthode** : lecture du plan entier, des appelants Connexions et du moteur déjà commité ; lecture Compose/Nginx locaux ; inspection des montages Docker sans environnement ni secrets.
- **Version** : frontend `a36c6d3` ; orchestrateur `8449a38`.

## 1. Synthèse
**Valider sous réserve** : l'intégration locale peut précéder la qualification matérielle, avec accord explicite déjà reçu. Elle ne prouve pas cette qualification. Trois risques doivent être encadrés : mauvais bundle servi, disparition du verrou de livraison, tests automatisés sur des données réelles.

| Sévérité | Nombre |
|---|---:|
| Critique | 0 |
| Majeur | 3 |
| Mineur | 0 |
| Suggestion | 0 |

## 2. Tableau des constats
| ID | Titre | Sévérité | Effort | Confiance |
|---|---|---|---|---|
| CHAL-01 | Le HTTPS habituel sert directement le dist canonique | Majeur | S | haute |
| CHAL-02 | L'autorisation d'intégrer n'est pas une qualification iPhone | Majeur | S | haute |
| CHAL-03 | L'application habituelle possède de vraies intégrations métier | Majeur | S | haute |

## 3. Détail des constats
### CHAL-01 — Identité et exposition du candidat local
- **Sévérité** : Majeur · **Effort** : S · **Confiance** : haute.
- **Preuve** : `../beercall-app/docker-compose.local-https.yml:30-35` monte `../beercall-frontend/dist` ; `docker inspect beercall_frontend --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'` confirme ce montage. L'override E2E, `docker-compose.workspace.e2e.yml:27-32`, construit un autre frontend sur 8080.
- **Problème / impact** : un build intermédiaire modifie immédiatement l'app habituelle, tandis que des tests sur 8080 peuvent encore viser l'ancien candidat.
- **Direction** : builds intermédiaires temporaires ; servir le build final seulement après tests, vérifier ses empreintes HTTPS et son SHA source. Conserver T12a avant toute acceptation E2E formelle sur 8080. Ne redémarrer aucune pile ni base.
- **Dépendances** : aucune.

### CHAL-02 — Qualification toujours ouverte
- **Sévérité** : Majeur · **Effort** : S · **Confiance** : haute.
- **Preuve** : journal du plan, H04/T07b : seuils non approuvés, retour iPhone 13 Pro « pas instant mais le changement est correct », sans série ni contexte froid/préparé.
- **Problème / impact** : intégrer avant ce jalon augmente le risque local accepté, mais ne rend pas une livraison sûre ni l'affichage instantané prouvé.
- **Direction** : déplacer explicitement le verrou avant clôture/livraison ; conserver les critères 150/200 ms, la cadence, les pertes de contexte et la recette HTTPS/PWA. Aucun T07b/T16 coché sur la seule intégration.
- **Dépendances** : CHAL-01.

### CHAL-03 — Isolation des essais automatisés
- **Sévérité** : Majeur · **Effort** : S · **Confiance** : haute.
- **Preuve** : `../beercall-app/nginx/local-https.conf:87-96` relaie `/api/` au backend existant ; `src/pages/Connections.tsx:103` navigue vers les vrais profils. Le HTTPS habituel n'est pas le banc sans compte.
- **Problème / impact** : une automatisation non isolée peut lire des profils/chats ou écrire des données métier et déclencher des intégrations réelles.
- **Direction** : fixtures synthétiques et blocage Firebase/réseau externe pour tous les essais automatiques ; aucun compte/message/photo/achat créé par l'agent. L'utilisateur fait sa recette habituelle lui-même ; diagnostics techniques expurgés seulement.
- **Dépendances** : CHAL-01.

## 4. Points positifs à préserver
- Moteur unique déjà testé et copie réelle sous Chromium/WebKit ; pas de nouvelle dépendance.
- Migration par écran et commits réversibles ; Signup et mondes gardent leur contrat.
- Interdiction explicite de production, destruction de données et faux certificats de frame.

## 5. Limites de l'audit
Pas de nouvelle observation matérielle, d'inspection de compte, de lecture de secrets ou de vérification d'accès iPhone au HTTPS habituel. Aucune mesure de délai ou cadence nouvelle n'est annoncée.

## 6. Questions ouvertes
Les seuils H04 et la recette matérielle restent ouverts ; ils ne bloquent plus l'intégration locale demandée mais restent nécessaires avant qualification/livraison.

## Cible et résumé
Intégrer le moteur dans les quatre vrais parcours.
Conserver leurs fonctions et les dernières images correctes.
Tester automatiquement sur fixtures, puis laisser l'utilisateur naviguer normalement.
Identifier le build servi par le HTTPS existant, sans redémarrer l'infrastructure.
Ne publier ni annoncer une qualification iPhone inexistante.

## Hypothèses testées
| Hypothèse | Statut | Preuve |
|---|---|---|
| Le HTTPS local existant peut servir le candidat sans autre page | vérifiée | montage dist Docker inspecté |
| Le frontend 8080 désigne automatiquement le même candidat | fausse | deux configurations de service distinctes |
| L'accord utilisateur supprime l'obligation de recette avant publication | fausse | demande explicite « sans déploiement en production » |
| Le nouveau moteur satisfait déjà tous les parcours | non vérifiée | écrans encore standalone avant T08 |

## Pré-mortem
| Rang | Échec | Probabilité | Impact | Prévention |
|---|---|---|---|---|
| 1 | Téléphone/automatisation regarde un ancien bundle | moyenne | majeur | empreintes HTTP et SW, SHA du candidat |
| 2 | Retour visuel partiel transformé en succès de performance | moyenne | majeur | qualification laissée ouverte, séries séparées |
| 3 | Essais automatiques écrivent sur de vrais comptes | faible | majeur | fixtures et réseau externe bloqué |

## Verdict
**Valider sous réserve** du traitement explicite de CHAL-01 à CHAL-03 dans l'amendement d'exécution. Le changement accepté concerne l'ordre et le lieu de la recette, pas les critères de qualité ni le droit de publier. L'exécution reste bornée aux fichiers T08–T12 et aux artefacts locaux identifiés.
