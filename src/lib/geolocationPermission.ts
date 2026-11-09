/**
 * Safari (iOS et macOS) n'expose pas la Permissions API pour `geolocation`.
 * Toute demande automatique y ouvre la modale système : on ne la déclenche
 * donc jamais au montage sans certitude que la permission est déjà accordée.
 */
let permissionQueryUnavailable = false;

export type GeolocationPermission = PermissionState | 'unknown';

export async function queryGeolocationPermission(): Promise<GeolocationPermission> {
    if (permissionQueryUnavailable || typeof navigator === 'undefined' || !navigator.permissions?.query) {
        return 'unknown';
    }
    try {
        const status = await navigator.permissions.query({name: 'geolocation'});
        return status.state;
    } catch (error) {
        // Safari refuse ce nom : ce n'est pas une panne, seulement une API absente.
        permissionQueryUnavailable = true;
        console.warn('[geolocation] Permissions API indisponible : demande réservée à un geste utilisateur.', error);
        return 'unknown';
    }
}
