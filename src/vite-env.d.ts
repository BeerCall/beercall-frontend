/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** B01 — format GLB des avatars ; `0`/`false` désactivent, absent = activé. */
    readonly VITE_FF_GLB_AVATAR?: string;
    /** B01 — format GLB des mondes ; `0`/`false` désactivent, absent = activé. */
    readonly VITE_FF_GLB_WORLDS?: string;
}
