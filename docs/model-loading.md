# Chargement des scènes et diagnostic mobile

## Scène conservée

`PersistentDashboard` conserve **un seul** dashboard par session authentifiée. Les routes
profil/contacts/chat masquent son DOM (`invisible`, opacité 0, `inert`, `aria-hidden`) sans détruire la
carte ni l'avatar. Les paramètres du dashboard sont figés pendant cette période. Le rendu
de l'avatar est suspendu ; GPS, abonnement squad et queries du dashboard sont désactivés.
Au retour, la carte est redimensionnée et les marqueurs de readiness attendent un nouvel
événement idle et une nouvelle frame soumise : aucun ancien timestamp n'est recyclé.
Le panneau garde ses dimensions hors écran : pas de `display: none` ni d'attribut `hidden`,
qui ramèneraient les canvases à 0×0 et déclencheraient une reconfiguration au retour.

Changer de compte/déconnecter détruit la scène et le cache de queries de la session.
Le cache de scènes ne grossit pas avec le nombre de squads visitées. Les modales de
mondes restent chargées à la demande, pas préinitialisées toutes ensemble. Cette approche
coûte de la mémoire tant que la session reste ouverte ; elle ne rend pas un redémarrage
complet de Safari/PWA identique à un simple retour SPA.

## Préparer les modèles

Depuis `beercall-frontend` (Node récent compatible avec les types TypeScript effaçables) :

```powershell
npm run models:prepare
# Ou un autre checkout backend :
npm run models:prepare -- ../beercall-backend/static/models
node --test scripts/prepare-models.test.mjs
```

Les FBX originaux ne sont jamais modifiés. La commande écrit des fichiers `.fbx.gz`,
un manifeste et des fichiers binaires `.bc3d` hashés sous `static/models/prepared/` du
backend. Ces sorties sont régénérables et ignorées par Git.

Le format préparé est la sérialisation ObjectLoader de Three, avec attributs géométriques
binaires, version de Three et SHA source. Il conserve noms des os, bind poses, matériaux
Phong et géométrie, sans simplification de maillage ni conversion de matériaux vers PBR.
Les modèles avec textures non prises en charge restent en FBX. Les 25 animations
continuent d'utiliser leurs packs existants, inchangés.

`PreparedModelLoader` vérifie la taille, SHA-256 et version avant reconstruction. Si le
manifeste est absent, le modèle non préparé, ou un fichier corrompu/incompatible, il utilise
le FBX original. Si les deux échouent, l'erreur remonte au chargement, pas une scène vide
déclarée prête. Préchargement et rendu partagent le même cache Fiber.

**Livraison indispensable** : servir les binaires avec gzip et les noms hashés en cache
immutable ; revalider le manifeste. Les fichiers préparés peuvent être plus grands en
brut que les FBX compressés en interne : ne pas les déployer sans mesurer le transport.
L'override Docker HTTPS local monte le dossier préparé dans le backend et Nginx et livre
ces fichiers avec `gzip_static`. Le build frontend seul ne génère pas les modèles et ne
dépend pas de la présence du backend ; il reste utilisable avec le fallback FBX.

## Mesurer depuis un téléphone

Après connexion, ouvrir l'application avec `?perf=1` (ex. `/squad/1?perf=1`). Le bouton
**Mesures** active un panneau local : scène initiale, derniers retours, tâches longues
quand le navigateur les expose, et échantillon de 10 secondes de gestes. Exporter le JSON.
Renseigner séparément modèle, OS, batterie/chaleur et réseau dans le protocole mobile.
Dans une PWA sans barre URL : **Profil > Trophées > Diagnostic de fluidité (local)**.
Le panneau peut être arrêté ; le premier signal de scène est conservé séparément des
signaux actifs pour ne pas confondre chargement initial et retour à chaud.

- Aucun envoi serveur, token, payload API ou URL de ressource dans le rapport.
- `avatarLoadingTrace` distingue attente de carte, suspension du canvas, chargement des
  modèles et cycle de vie de l'avatar. Historique local borné à 100 événements.
- Les temps de décodage distinguent FBX et format préparé ; ils excluent compilation GPU.
- Sur Safari, les Long Tasks peuvent être **non mesurées**, jamais assimilées à zéro.
- Les marqueurs WebGL et intervalles rAF restent des proxys logiciels, pas une preuve
  d'affichage physique ou de qualification 60/120 Hz.
- Comparer lancement froid, relance PWA et retour SPA séparément. Ne pas vider le cache
  pour tester un retour à chaud.

## Contrôles complets (depuis la racine BeerCall)

```powershell
node bench/prepared-models.mjs --verify-only
node bench/prepared-models.mjs
npm --prefix beercall-app/e2e test -- --config=playwright.fluidite.config.ts
```

Le premier contrôle compare les modèles préparés aux sources et les poses des
25 animations sur deux avatars représentatifs. Le second ajoute dix paires alternées de
décodage sur des modèles réels. Une mesure de décodage seule ne prouve pas le temps de
chargement de toute l'application ni les performances d'un iPhone.
