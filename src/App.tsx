import React from 'react';
import { AppProvider, useAppContext } from './store/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ProfilePage } from './pages/ProfilePage';
import { ScanPage } from './pages/ScanPage';
import { ThreeDPage } from './pages/ThreeDPage';
import { BioPage } from './pages/BioPage';
import { ExportPage } from './pages/ExportPage';

const AppContent: React.FC = () => {
  const { activeTab } = useAppContext();

  return (
    <>
      <Header />
      <div className="page-container">
        {activeTab === 'profil' && <ProfilePage />}
        {activeTab === 'skan' && <ScanPage />}
        {activeTab === '3d' && <ThreeDPage />}
        {activeTab === 'bio' && <BioPage />}
        {activeTab === 'export' && <ExportPage />}
      </div>
      <BottomNav />
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

