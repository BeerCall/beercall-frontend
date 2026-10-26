import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext, type ReactNode } from 'react';

interface Candidate {
  id: string;
  distanceFromCenter: number;
}

interface ThumbnailBudgetActions {
  registerCandidate: (id: string, inView: boolean, element: HTMLElement | null) => void;
  unregisterCandidate: (id: string) => void;
}

interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

// Deux contextes distincts : les actions restent stables quand les slots changent,
// sinon chaque attribution réinscrirait/désinscrirait tous les candidats.
const ThumbnailBudgetActionsContext = createContext<ThumbnailBudgetActions | null>(null);
const ThumbnailBudgetGrantsContext = createContext<Set<string> | null>(null);

function currentViewportRect(container: HTMLElement | null): ViewportRect {
  if (container) {
    const rect = container.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  }
  return {
    top: 0,
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function intersects(a: ViewportRect, b: ViewportRect): boolean {
  return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
}

export function ThumbnailBudgetProvider({
  children,
  maxSlots = 2,
  containerRef,
}: {
  children: ReactNode;
  maxSlots?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const candidatesRef = useRef<Map<string, { inView: boolean; element: HTMLElement | null }>>(new Map());
  const [grantedIds, setGrantedIds] = useState<Set<string>>(() => new Set());
  const frameRef = useRef<number | null>(null);

  const recomputeSlots = useCallback(() => {
    const candidates = candidatesRef.current;
    const viewport = currentViewportRect(containerRef?.current ?? null);
    const centerX = viewport.left + viewport.width / 2;
    const centerY = viewport.top + viewport.height / 2;

    const visibleCandidates: Candidate[] = [];
    for (const [id, data] of candidates.entries()) {
      if (!data.inView) continue;
      // La marge de préchargement d'IntersectionObserver n'accorde aucun slot :
      // seul le rectangle réellement dans le scrollport compte.
      const rect = data.element ? data.element.getBoundingClientRect() : viewport;
      if (!intersects(rect, viewport)) continue;
      const itemCenterX = rect.left + rect.width / 2;
      const itemCenterY = rect.top + rect.height / 2;
      visibleCandidates.push({
        id,
        distanceFromCenter: Math.hypot(itemCenterX - centerX, itemCenterY - centerY),
      });
    }

    // Tri déterministe et transitif : distance exacte au centre, puis identifiant.
    visibleCandidates.sort((a, b) => {
      if (a.distanceFromCenter !== b.distanceFromCenter) {
        return a.distanceFromCenter - b.distanceFromCenter;
      }
      return a.id.localeCompare(b.id);
    });

    const newGranted = new Set<string>();
    for (let i = 0; i < Math.min(maxSlots, visibleCandidates.length); i++) {
      newGranted.add(visibleCandidates[i].id);
    }

    setGrantedIds(prev => {
      if (prev.size === newGranted.size) {
        let identical = true;
        for (const id of newGranted) {
          if (!prev.has(id)) {
            identical = false;
            break;
          }
        }
        if (identical) return prev;
      }
      return newGranted;
    });
  }, [containerRef, maxSlots]);

  const scheduleRecompute = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      recomputeSlots();
    });
  }, [recomputeSlots]);

  // Écoute locale du scrollport : défilement de la liste et changement de taille.
  useEffect(() => {
    const container = containerRef?.current ?? null;
    scheduleRecompute();
    if (!container) return;

    container.addEventListener('scroll', scheduleRecompute, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRecompute);
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', scheduleRecompute);
      observer?.disconnect();
    };
  }, [containerRef, scheduleRecompute]);

  // Démontage : frame, listeners et candidats ne survivent pas au provider.
  useEffect(() => {
    const candidates = candidatesRef.current;
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      candidates.clear();
    };
  }, []);

  const registerCandidate = useCallback((id: string, inView: boolean, element: HTMLElement | null) => {
    candidatesRef.current.set(id, { inView, element });
    scheduleRecompute();
  }, [scheduleRecompute]);

  const unregisterCandidate = useCallback((id: string) => {
    if (candidatesRef.current.delete(id)) {
      scheduleRecompute();
    }
  }, [scheduleRecompute]);

  const actions = useMemo(
    () => ({ registerCandidate, unregisterCandidate }),
    [registerCandidate, unregisterCandidate]
  );

  return React.createElement(
    ThumbnailBudgetActionsContext.Provider,
    // eslint-disable-next-line react-hooks/refs -- actions exposées en contexte : les callbacks n'accèdent aux refs qu'en différé (effets/frames)
    { value: actions },
    React.createElement(ThumbnailBudgetGrantsContext.Provider, { value: grantedIds }, children)
  );
}

export function useThumbnailSlot(
  id: string,
  inView: boolean,
  elementRef?: React.RefObject<HTMLElement | null> | null
): boolean {
  const actions = useContext(ThumbnailBudgetActionsContext);
  const grantedIds = useContext(ThumbnailBudgetGrantsContext);

  useEffect(() => {
    if (!actions) return;
    const element = elementRef ? elementRef.current : null;
    actions.registerCandidate(id, inView, element);
    return () => {
      actions.unregisterCandidate(id);
    };
  }, [actions, id, inView, elementRef]);

  // Si aucun provider (ex: usage isolé hors liste), par défaut inView est respecté
  if (!actions || !grantedIds) return inView;

  return grantedIds.has(id);
}
