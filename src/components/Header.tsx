import React from 'react';
import { useAppContext } from '../store/AppContext';

export const Header: React.FC = () => {
  const { leds } = useAppContext();

  return (
    <header className="app-header">
      <div className="hdr-dot"></div>
      <div className="hdr-title">FACE3D · PRO v5</div>
      <div className="hdr-leds">
        <div className="hdr-led"><div className={`led-dot ${leds.ai}`}></div><span>AI</span></div>
        <div className="hdr-led"><div className={`led-dot ${leds.db}`}></div><span>DB</span></div>
        <div className="hdr-led"><div className={`led-dot ${leds.scan}`}></div><span>SCAN</span></div>
      </div>
    </header>
  );
};
