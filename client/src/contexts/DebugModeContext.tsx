import React, { createContext, useContext, useState, useEffect } from 'react';

interface DebugModeContextType {
  isDebugMode: boolean;
  toggleDebugMode: () => void;
  elementPositions: Record<string, { x: number; y: number }>;
  updateElementPosition: (elementId: string, x: number, y: number) => void;
  saveLayout: () => void;
}

const DebugModeContext = createContext<DebugModeContextType | undefined>(undefined);

export function DebugModeProvider({ children }: { children: React.ReactNode }) {
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [elementPositions, setElementPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Load saved layout from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('debug-layout');
    if (saved) {
      try {
        setElementPositions(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load debug layout:', e);
      }
    }
  }, []);

  const toggleDebugMode = () => {
    setIsDebugMode(prev => !prev);
  };

  const updateElementPosition = (elementId: string, x: number, y: number) => {
    setElementPositions(prev => ({
      ...prev,
      [elementId]: { x, y }
    }));
  };

  const saveLayout = () => {
    localStorage.setItem('debug-layout', JSON.stringify(elementPositions));
    alert('✅ Layout saved! Positions will be preserved across sessions.');
  };

  return (
    <DebugModeContext.Provider value={{
      isDebugMode,
      toggleDebugMode,
      elementPositions,
      updateElementPosition,
      saveLayout
    }}>
      {children}
    </DebugModeContext.Provider>
  );
}

export function useDebugMode() {
  const context = useContext(DebugModeContext);
  if (context === undefined) {
    throw new Error('useDebugMode must be used within a DebugModeProvider');
  }
  return context;
}
