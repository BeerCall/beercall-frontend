export const SQUAD_PAGE_SIZE = 3;
export const WHEEL_ACTION_ANGLES = { create: -48, join: 48 } as const;

export function squadPageCount(count: number): number {
    return Math.max(1, Math.ceil(Math.max(0, count) / SQUAD_PAGE_SIZE));
}

export function clampSquadPage(page: number, count: number): number {
    const index = Number.isFinite(page) ? Math.trunc(page) : 0;
    return Math.max(0, Math.min(index, squadPageCount(count) - 1));
}

export function squadPageForId<T extends { id: number }>(squads: readonly T[], id?: string | number): number {
    const index = squads.findIndex(squad => String(squad.id) === String(id));
    return index < 0 ? 0 : Math.floor(index / SQUAD_PAGE_SIZE);
}

export function squadWheelPage<T>(squads: readonly T[], requestedPage: number) {
    const page = clampSquadPage(requestedPage, squads.length);
    const visible = squads.slice(page * SQUAD_PAGE_SIZE, (page + 1) * SQUAD_PAGE_SIZE);
    const angles = visible.length === 2 ? [-12, 12] : visible.length === 3 ? [-24, 0, 24] : [0];
    return {
        page,
        pageCount: squadPageCount(squads.length),
        items: visible.map((squad, index) => ({ squad, angle: angles[index] })),
        previous: clampSquadPage(page - 1, squads.length),
        next: clampSquadPage(page + 1, squads.length),
    };
}
