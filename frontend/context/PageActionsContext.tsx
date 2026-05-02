'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { LucideIcon } from 'lucide-react';

export interface SidebarAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface PageActionsContextValue {
  actions: SidebarAction[];
  setActions: (actions: SidebarAction[]) => void;
  clearActions: () => void;
}

const PageActionsContext = createContext<PageActionsContextValue>({
  actions: [],
  setActions: () => {},
  clearActions: () => {},
});

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActionsState] = useState<SidebarAction[]>([]);

  const setActions = useCallback((a: SidebarAction[]) => setActionsState(a), []);
  const clearActions = useCallback(() => setActionsState([]), []);

  return (
    <PageActionsContext.Provider value={{ actions, setActions, clearActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  return useContext(PageActionsContext);
}
