import {useEffect, useRef, useState, type RefObject} from 'react';

export interface ChatViewportRect {
    /** Hauteur utile en pixels, dans le repère du parent. */
    height: number;
    /** Décalage vertical local par rapport au parent. */
    top: number;
    width: number;
    left: number;
    /** Échelle du visualViewport (1 = pas de pinch). */
    scale: number;
}

interface LayoutRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

function layoutRectOf(element: HTMLElement | null): LayoutRect | null {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height) || rect.height <= 0) return null;
    return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
    };
}

function fallbackRect(parentRect: LayoutRect | null): ChatViewportRect {
    if (parentRect) {
        return {
            height: Math.max(0, parentRect.height),
            top: 0,
            left: 0,
            width: Math.max(0, parentRect.width),
            scale: 1,
        };
    }
    return {
        height: window.innerHeight,
        top: 0,
        left: 0,
        width: window.innerWidth,
        scale: 1,
    };
}

/**
 * Mesure le viewport visuel iOS intersecté avec le cadre du parent du chat.
 * Aucune safe-area n'est ajoutée : le parent la réserve déjà.
 */
export function useChatViewport(containerRef: RefObject<HTMLElement | null>): ChatViewportRect {
    const [viewport, setViewport] = useState<ChatViewportRect>(() => fallbackRect(null));
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        const measure = () => {
            frameRef.current = null;

            const visual = window.visualViewport;
            const parent = containerRef.current?.parentElement ?? null;
            const parentRect = layoutRectOf(parent);

            if (!visual) {
                const fallback = fallbackRect(parentRect);
                setViewport(current => (
                    current.height === fallback.height && current.top === fallback.top &&
                    current.left === fallback.left && current.width === fallback.width && current.scale === fallback.scale
                        ? current
                        : fallback
                ));
                return;
            }

            const scale = Number.isFinite(visual.scale) && visual.scale > 0 ? visual.scale : 1;
            const visibleTop = visual.offsetTop;
            const visibleLeft = visual.offsetLeft;
            const visibleBottom = visibleTop + visual.height;
            const visibleRight = visual.offsetLeft + visual.width;

            const frame: LayoutRect = parentRect ?? {
                top: window.scrollY,
                left: window.scrollX,
                width: window.innerWidth,
                height: window.innerHeight,
            };

            const topDoc = Math.max(visibleTop, frame.top);
            const leftDoc = Math.max(visibleLeft, frame.left);
            const bottomDoc = Math.min(visibleBottom, frame.top + frame.height);
            const rightDoc = Math.min(visibleRight, frame.left + frame.width);

            const next: ChatViewportRect = {
                top: Math.max(0, topDoc - frame.top),
                left: Math.max(0, leftDoc - frame.left),
                height: Math.max(0, bottomDoc - topDoc),
                width: Math.max(0, rightDoc - leftDoc),
                scale,
            };

            setViewport(current => (
                current.height === next.height && current.top === next.top &&
                current.left === next.left && current.width === next.width && current.scale === next.scale
                    ? current
                    : next
            ));

            // iOS décale parfois la fenêtre : on la remet à zéro une seule fois par frame,
            // uniquement hors pinch, et jamais si elle est déjà à zéro (pas de boucle).
            const focusedInside = Boolean(containerRef.current?.contains(document.activeElement));
            const noPinch = Math.abs(scale - 1) <= 0.01;
            if (focusedInside && noPinch && (window.scrollX !== 0 || window.scrollY !== 0)) {
                window.scrollTo({left: 0, top: 0, behavior: 'instant' as ScrollBehavior});
                // Demander une mesure sur la frame suivante pour stabiliser après remise à zéro
                schedule();
            }
        };

        const schedule = () => {
            if (frameRef.current !== null) return;
            frameRef.current = window.requestAnimationFrame(measure);
        };

        schedule();
        const visual = window.visualViewport;
        visual?.addEventListener('resize', schedule);
        visual?.addEventListener('scroll', schedule);
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule);

        const container = containerRef.current;
        container?.addEventListener('focusin', schedule);
        container?.addEventListener('focusout', schedule);

        return () => {
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            visual?.removeEventListener('resize', schedule);
            visual?.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule);
            container?.removeEventListener('focusin', schedule);
            container?.removeEventListener('focusout', schedule);
        };
    }, [containerRef]);

    return viewport;
}
