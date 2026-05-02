'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface PageActionsContextValue {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
  clearActions: () => void;
}

const PageActionsContext = createContext<PageActionsContextValue>({
  actions: null,
  setActions: () => {},
  clearActions: () => {},
});

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActionsState] = useState<ReactNode>(null);

  const setActions = useCallback((node: ReactNode) => setActionsState(node), []);
  const clearActions = useCallback(() => setActionsState(null), []);

  return (
    <PageActionsContext.Provider value={{ actions, setActions, clearActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  return useContext(PageActionsContext);
}
