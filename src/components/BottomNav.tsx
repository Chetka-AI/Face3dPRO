import React from 'react';
import { useAppContext } from '../store/AppContext';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useAppContext();

  const navItems = [
    { id: 'profil', icon: '👤', label: 'Profil' },
    { id: 'skan', icon: '📷', label: 'Skan' },
    { id: '3d', icon: '🧊', label: '3D' },
    { id: 'bio', icon: '📊', label: 'Bio' },
    { id: 'export', icon: '⬇', label: 'Eksport' }
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => setActiveTab(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
