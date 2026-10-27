import { createContext, useContext, useEffect, type RefObject } from 'react';

export interface Candidate {
  id: string;
  distanceFromCenter: number;
}

export interface ThumbnailBudgetActions {
  registerCandidate: (id: string, inView: boolean, element: HTMLElement | null) => void;
  unregisterCandidate: (id: string) => void;
}

export interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

// Deux contextes distincts : les actions restent stables quand les slots changent,
// sinon chaque attribution réinscrirait/désinscrirait tous les candidats.
export const ThumbnailBudgetActionsContext = createContext<ThumbnailBudgetActions | null>(null);
export const ThumbnailBudgetGrantsContext = createContext<Set<string> | null>(null);

export function useThumbnailSlot(
  id: string,
  inView: boolean,
  elementRef?: RefObject<HTMLElement | null> | null
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
