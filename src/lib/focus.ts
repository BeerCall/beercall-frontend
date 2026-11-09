/** Retire le focus d'un descendant avant de masquer son conteneur aux lecteurs d'écran. */
export function blurFocusedDescendant(container: HTMLElement | null): void {
    const focused = document.activeElement;
    if (container && focused instanceof HTMLElement && container.contains(focused)) {
        focused.blur();
    }
}
