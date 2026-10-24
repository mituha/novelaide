import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { AIContextState } from '../types';

interface AIContextContextType {
  contextState: AIContextState;
  setContextState: React.Dispatch<React.SetStateAction<AIContextState>>;
  addCustomPath: (path: string) => void;
  removeCustomPath: (path: string) => void;
  resetContext: () => void;
}

const defaultState: AIContextState = {
  includeLeftActive: true,
  includeRightActive: false,
  includeAllOpen: false,
  customPaths: [],
};

const AIContextContext = createContext<AIContextContextType | undefined>(undefined);

export function AIContextProvider({ children }: { children: ReactNode }) {
  const [contextState, setContextState] = useState<AIContextState>(defaultState);

  const addCustomPath = useCallback((path: string) => {
    setContextState((prev) => {
      if (prev.customPaths.includes(path)) return prev;
      return { ...prev, customPaths: [...prev.customPaths, path] };
    });
  }, []);

  const removeCustomPath = useCallback((path: string) => {
    setContextState((prev) => ({
      ...prev,
      customPaths: prev.customPaths.filter((p) => p !== path),
    }));
  }, []);

  const resetContext = useCallback(() => {
    setContextState(defaultState);
  }, []);

  return (
    <AIContextContext.Provider value={{ contextState, setContextState, addCustomPath, removeCustomPath, resetContext }}>
      {children}
    </AIContextContext.Provider>
  );
}

export const useAIContext = () => {
  const context = useContext(AIContextContext);
  if (context === undefined) {
    throw new Error('useAIContext must be used within an AIContextProvider');
  }
  return context;
};
