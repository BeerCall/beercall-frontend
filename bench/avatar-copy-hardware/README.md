# Ancien banc matériel de copie des avatars — retiré en 9g

Ce banc utilisait exclusivement `SharedAvatar`, `AvatarViewportProvider` et le
registre de copies FBX/BC3D supprimés en 9g. Ses anciens points d'entrée ont été
retirés avec leurs consommateurs : ils ne décrivent pas le rendu GLB actuel et ne
doivent pas être remplacés par un autre moteur sous les mêmes métriques.

Pour reproduire une mesure historique, utiliser un checkout séparé du commit
frontend `605360d` (code et protocole correspondants), sans modifier la stack locale.
Pour la recette actuelle, utiliser les scénarios `tests/fluidite/worlds.spec.ts`,
`world-slot.spec.ts` et le panneau `VITE_WORLD_PROBE=1`.

`measurements.ts` reste conservé : ses calculs sont encore utilisés et testés par
`src/__tests__/avatarCopyHardwareMeasurements.test.ts`.
