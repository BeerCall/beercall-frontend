/**
 * 8h-4b-3 — Indicateur de préparation sur le tableau de bord (build probe).
 *
 * Permet d'attendre « préparation terminée : oui » avant le premier toucher
 * de « Mondes », sans ouvrir la modale (qui déclencherait la mesure).
 *
 * 8h-4b-3b — Le total affiché est celui de l'apéro cible courant : quand la
 * cible change (changement de squad), le magasin repart d'un total nul, puis
 * les participants du nouvel apéro remplacent l'ancien. Tant que les données
 * ne sont pas arrivées, on n'affiche pas « 0/0 » mais l'attente explicite.
 */

import { usePreparationSnapshot } from '../worlds/worldPreparation';

function secondsSinceAppOpen(value: number | null): string {
    if (value === null) return '';
    return `${(value / 1_000).toLocaleString('fr-FR', {maximumFractionDigits: 1})} s`;
}

export default function WorldPreparationBadge() {
    const preparation = usePreparationSnapshot();
    const done = preparation.phase === 'done';
    const started = preparation.targetBeerCallId !== null;
    const totalAvatars = (['bar', 'piscine', 'dodo'] as const)
        .reduce((total, world) => total + preparation.worlds[world].total, 0);
    const grantedAvatars = (['bar', 'piscine', 'dodo'] as const)
        .reduce((total, world) => total + preparation.worlds[world].granted, 0);

    if (!started) return null;

    let detail: string;
    if (done) {
        detail = preparation.doneAt !== null
            ? ` · à ${secondsSinceAppOpen(preparation.doneAt)} depuis l’ouverture`
            : '';
    } else if (!preparation.dataReady) {
        detail = ' · en attente des données';
    } else {
        detail = ` · ${preparation.phase} · ${grantedAvatars}/${totalAvatars} avatars`;
    }

    return (
        <div
            data-testid="world-preparation-badge"
            data-beer-call-id={preparation.targetBeerCallId ?? ''}
            data-preparation-phase={preparation.phase}
            data-data-ready={preparation.dataReady ? 'true' : 'false'}
            data-total-avatars={totalAvatars}
            data-granted-avatars={grantedAvatars}
            className={`pointer-events-none fixed left-3 top-16 z-[140] rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide shadow-lg backdrop-blur ${
                done
                    ? 'border-emerald-300 bg-emerald-950/90 text-emerald-200'
                    : 'border-amber-300 bg-amber-950/90 text-amber-200'
            }`}
        >
            Préparation terminée : {done ? 'oui' : 'non'}{detail}
        </div>
    );
}
