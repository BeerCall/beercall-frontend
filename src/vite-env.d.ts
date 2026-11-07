/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** B01 — format GLB des avatars ; `0`/`false` désactivent, absent = activé. */
    readonly VITE_FF_GLB_AVATAR?: string;
    /** B01 — format GLB des mondes ; `0`/`false` désactivent, absent = activé. */
    readonly VITE_FF_GLB_WORLDS?: string;
    /** 8h-4b-1 — build de recette avec le bouton de parcours des mondes. */
    readonly VITE_WORLD_PROBE?: string;
    /** 8h-4b-1 — hash court du commit frontend, injecté au build. */
    readonly VITE_APP_COMMIT?: string;
    /** 8h-4b-1 — date UTC du build, injectée au build. */
    readonly VITE_APP_BUILD_TIME?: string;
}
