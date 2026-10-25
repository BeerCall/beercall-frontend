import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext, type ReactNode } from 'react';

interface Candidate {
  id: string;
  inView: boolean;
  distanceFromCenter: number;
}

interface ThumbnailBudgetContextType {
  registerCandidate: (id: string, inView: boolean, element: HTMLElement | null) => void;
  unregisterCandidate: (id: string) => void;
  grantedIds: Set<string>;
}

const ThumbnailBudgetContext = createContext<ThumbnailBudgetContextType | null>(null);

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
  const recomputeQueuedRef = useRef(false);

  const recomputeSlots = useCallback(() => {
    recomputeQueuedRef.current = false;
    const candidates = candidatesRef.current;
    const container = containerRef?.current;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const centerY = containerRect ? containerRect.top + containerRect.height / 2 : window.innerHeight / 2;

    const inViewList: Candidate[] = [];
    for (const [id, data] of candidates.entries()) {
      if (data.inView) {
        let dist = 0;
        if (data.element) {
          const rect = data.element.getBoundingClientRect();
          const itemCenter = rect.top + rect.height / 2;
          dist = Math.abs(itemCenter - centerY);
        }
        inViewList.push({ id, inView: true, distanceFromCenter: dist });
      }
    }

    // Tri déterministe : distance la plus faible au centre, puis id
    inViewList.sort((a, b) => {
      if (Math.abs(a.distanceFromCenter - b.distanceFromCenter) > 2) {
        return a.distanceFromCenter - b.distanceFromCenter;
      }
      return a.id.localeCompare(b.id);
    });

    const newGranted = new Set<string>();
    for (let i = 0; i < Math.min(maxSlots, inViewList.length); i++) {
      newGranted.add(inViewList[i].id);
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
    if (!recomputeQueuedRef.current) {
      recomputeQueuedRef.current = true;
      Promise.resolve().then(recomputeSlots);
    }
  }, [recomputeSlots]);

  const registerCandidate = useCallback((id: string, inView: boolean, element: HTMLElement | null) => {
    candidatesRef.current.set(id, { inView, element });
    scheduleRecompute();
  }, [scheduleRecompute]);

  const unregisterCandidate = useCallback((id: string) => {
    if (candidatesRef.current.delete(id)) {
      scheduleRecompute();
    }
  }, [scheduleRecompute]);

  const contextValue = useMemo(
    () => ({ registerCandidate, unregisterCandidate, grantedIds }),
    [registerCandidate, unregisterCandidate, grantedIds]
  );

  return React.createElement(
    ThumbnailBudgetContext.Provider,
    // eslint-disable-next-line react-hooks/refs -- contextValue contient des callbacks accédant aux refs en différé (effets/microtâches)
    { value: contextValue },
    children
  );
}

export function useThumbnailSlot(
  id: string,
  inView: boolean,
  elementRef?: React.RefObject<HTMLElement | null> | null
): boolean {
  const context = useContext(ThumbnailBudgetContext);

  useEffect(() => {
    if (!context) return;
    const element = elementRef ? elementRef.current : null;
    context.registerCandidate(id, inView, element);
    return () => {
      context.unregisterCandidate(id);
    };
  }, [context, id, inView, elementRef]);

  // Si aucun provider (ex: usage isolé hors liste), par défaut inView est respecté
  if (!context) return inView;

  return context.grantedIds.has(id);
}
