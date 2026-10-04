# OpenCode System Prompt - BeerCall Frontend

Ce fichier définit les directives strictes, l'architecture et les conventions pour le développement du frontend BeerCall.

## 🏗 Architecture globale
- **Type** : Single Page Application (SPA) / Progressive Web App (PWA).
- **Structure des dossiers** :
  - `components/` : Composants UI réutilisables.
  - `pages/` : Vues principales par route.
  - `hooks/` : Custom React Hooks pour encapsuler la logique d'UI.
  - `store/` : Gestion de l'état global (Zustand).
  - `lib/` : Utilitaires, instances API (Axios), configuration Firebase.
  - `types/` : Fichiers de définitions TypeScript.

## 🛠 Stack Technique
- **Cœur** : React 19, TypeScript, Vite.
- **State Management** : Zustand (Global), React Query (Cache et fetching de données API).
- **Styling & Animations** : Tailwind CSS v4, Framer Motion, Lucide React.
- **Requêtes API** : Axios.
- **3D & Cartographie** : React-Three-Fiber / Drei (3D), Maplibre GL / react-map-gl (Cartes).

## 📏 Conventions de Codage
- **Typage Strict** : TypeScript rigoureux. Ne pas utiliser de types implicites ou `any`. Utiliser systématiquement les types définis dans `types/`.
- **Nommage** :
  - `PascalCase` pour les fichiers `.tsx`, les composants React et les Interfaces.
  - `camelCase` pour les variables, fonctions et fichiers utilitaires `.ts`.
- **Modèle de Composant** :
  - Utilisation exclusive des Functional Components et des Hooks.
  - Privilégier les composants purs (stateless) dans `components/` et la composition avec le store ou React Query dans `pages/` ou `hooks/`.
- **CSS / Styling** :
  - Pas de fichiers CSS classiques ou de modules (sauf config globale). Utiliser exclusivement les classes utilitaires de **Tailwind CSS**.

## 🔒 Sécurité & Gestion des Erreurs
- **Fetching** : Les requêtes ne doivent jamais être faites en brut dans un `useEffect` mais via des custom hooks utilisant `useQuery` ou `useMutation` (React Query) pour gérer automatiquement les états de chargement (loading) et les erreurs.
- **Erreurs API** : Capturées globalement via les intercepteurs Axios ou les callbacks de React Query. Toujours fournir un feedback visuel à l'utilisateur lors d'une erreur réseau ou d'autorisation.
