import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ScanData, Point2D } from '../types';

interface LogEntry {
  id: number;
  msg: string;
  type: 'info' | 'ok' | 'err' | 'warn';
  time: string;
}

interface AppContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentCharId: number | null;
  setCurrentCharId: (id: number | null) => void;
  logs: LogEntry[];
  sysLog: (msg: string, type: 'info' | 'ok' | 'err' | 'warn') => void;
  clearLogs: () => void;
  leds: { ai: string; db: string; scan: string };
  setLed: (id: 'ai' | 'db' | 'scan', state: string) => void;
  currentScan: ScanData | null;
  setCurrentScan: (scan: ScanData | null) => void;
  viewMode: string;
  setViewMode: (mode: string) => void;
  texCanvas: HTMLCanvasElement | null;
  setTexCanvas: (canvas: HTMLCanvasElement | null) => void;
  editKpts: Point2D[] | null;
  setEditKpts: (kpts: Point2D[] | null) => void;
  lastTris: number[][] | null;
  setLastTris: (tris: number[][] | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState('profil');
  const [currentCharId, setCurrentCharId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [leds, setLeds] = useState({ ai: 'dim', db: 'dim', scan: 'dim' });
  const [currentScan, setCurrentScan] = useState<ScanData | null>(null);
  const [viewMode, setViewMode] = useState('master');
  const [texCanvas, setTexCanvas] = useState<HTMLCanvasElement | null>(null);
  const [editKpts, setEditKpts] = useState<Point2D[] | null>(null);
  const [lastTris, setLastTris] = useState<number[][] | null>(null);

  const sysLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn') => {
    const time = new Date().toLocaleTimeString('pl', { hour12: false });
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), msg, type, time }]);
  };

  const clearLogs = () => setLogs([]);

  const setLed = (id: 'ai' | 'db' | 'scan', state: string) => {
    setLeds(prev => ({ ...prev, [id]: state }));
  };

  return (
    <AppContext.Provider value={{
      activeTab, setActiveTab,
      currentCharId, setCurrentCharId,
      logs, sysLog, clearLogs,
      leds, setLed,
      currentScan, setCurrentScan,
      viewMode, setViewMode,
      texCanvas, setTexCanvas,
      editKpts, setEditKpts,
      lastTris, setLastTris
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
