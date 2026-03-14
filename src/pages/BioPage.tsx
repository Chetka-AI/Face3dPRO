import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useAppContext } from '../store/AppContext';
import { computeAsymmetry, computeHarmony, cosSim, eucDist, bioSim } from '../utils/biometrics';
import { LM } from '../utils/constants';

export const BioPage: React.FC = () => {
  const { currentCharId, sysLog } = useAppContext();
  const [simMethod, setSimMethod] = useState('cosine');
  const [simResults, setSimResults] = useState<any[]>([]);

  const char = useLiveQuery(() => currentCharId ? db.characters.get(currentCharId) : undefined, [currentCharId]);
  const master = useLiveQuery(() => currentCharId ? db.masters.get(currentCharId) : undefined, [currentCharId]);

  const handleComputeSimilarity = async () => {
    if (!currentCharId) { sysLog('Wybierz profil!', 'warn'); return; }
    if (!master) { sysLog('Wygeneruj model!', 'warn'); return; }

    const ref = master.points.flatMap(p => [p.x, p.y, p.z]);
    const chars = await db.characters.toArray();
    const res = [];

    for (const ch of chars) {
      if (ch.id === currentCharId) continue;
      const m = await db.masters.get(ch.id!);
      if (!m) continue;
      const vec = m.points.flatMap(p => [p.x, p.y, p.z]);
      let sim = 0;
      if (simMethod === 'cosine') sim = cosSim(ref, vec);
      else if (simMethod === 'euclidean') sim = 1 / (1 + eucDist(ref, vec) / 100);
      else sim = bioSim(master.points, m.points);
      res.push({ name: ch.name, sim });
    }

    res.sort((a, b) => b.sim - a.sim);
    setSimResults(res);
  };

  const renderBioGrid = () => {
    if (!master) return <div style={{ color: 'var(--dim)', padding: '16px', fontSize: '12px', gridColumn: 'span 2' }}>Wygeneruj model ważony.</div>;
    const p = master.points;
    const d = (a: number, b: number) => { const dx = p[a].x - p[b].x, dy = p[a].y - p[b].y, dz = p[a].z - p[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
    const metrics = [
      { n: 'Roz. oczu (wew.)', v: d(LM.L_EYE_IN, LM.R_EYE_IN) }, { n: 'Roz. oczu (zew.)', v: d(LM.L_EYE_OUT, LM.R_EYE_OUT) },
      { n: 'Szer. twarzy', v: d(LM.LEFT, LM.RIGHT) }, { n: 'Wys. twarzy', v: d(LM.TOP, LM.BOTTOM) },
      { n: 'Szer. nosa', v: d(LM.NOSE_L, LM.NOSE_R) }, { n: 'Dług. nosa', v: d(LM.NOSE_BASE, LM.NOSE_TIP) },
      { n: 'Głębia nosa Z', v: Math.abs(p[LM.NOSE_TIP].z - p[LM.CENTER].z) },
      { n: 'Szer. ust', v: d(LM.MOUTH_L, LM.MOUTH_R) }, { n: 'Grub. ust', v: d(LM.MOUTH_TOP, LM.MOUTH_BOT) },
      { n: 'Szer. żuchwy', v: d(LM.JAW_L, LM.JAW_R) }, { n: 'Szer. czoła', v: d(LM.BROW_L, LM.BROW_R) },
      { n: 'Wys. oka L', v: d(LM.L_EYE_TOP, LM.L_EYE_BOT) }, { n: 'Wys. oka P', v: d(LM.R_EYE_TOP, LM.R_EYE_BOT) },
      { n: 'Asymetria', v: computeAsymmetry(p) * 100, u: '%' }
    ];
    return metrics.map(m => (
      <div key={m.n} className="bio-cell">
        <div className="bio-name">{m.n}</div>
        <div className="bio-value">{m.u ? m.v.toFixed(1) : m.v.toFixed(2)} <span className="bio-unit">{m.u || 'u'}</span></div>
      </div>
    ));
  };

  const renderRatios = () => {
    if (!master) return null;
    const p = master.points;
    const d = (a: number, b: number) => { const dx = p[a].x - p[b].x, dy = p[a].y - p[b].y, dz = p[a].z - p[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
    const eD = d(LM.L_EYE_IN, LM.R_EYE_IN) || 1, fW = d(LM.LEFT, LM.RIGHT), fH = d(LM.TOP, LM.BOTTOM);
    const { harmony } = computeHarmony(p);
    const ratios = [
      { n: 'Twarz (H/W)', v: (fH / fW).toFixed(3) }, { n: 'Nos/Oczy', v: (d(LM.NOSE_L, LM.NOSE_R) / eD).toFixed(3) },
      { n: 'Usta/Oczy', v: (d(LM.MOUTH_L, LM.MOUTH_R) / eD).toFixed(3) }, { n: 'Oczy/Twarz', v: (eD / fW).toFixed(3) },
      { n: 'Złota prop.', v: (fH / fW / 1.618).toFixed(3) }, { n: 'Harmonia', v: Math.round(harmony * 100) + '%' }
    ];
    return ratios.map(r => (
      <div key={r.n} className="bio-cell">
        <div className="bio-name">{r.n}</div>
        <div className="bio-value">{r.v}</div>
      </div>
    ));
  };

  return (
    <div className="page active" style={{ display: 'flex' }}>
      <div className="sh">Wskaźniki biometryczne</div>
      <div className="bio-grid">{renderBioGrid()}</div>

      <div className="sh">Indeksy proporcji</div>
      <div className="bio-grid">{renderRatios()}</div>

      <div className="sh">Podobieństwo <span className="badge">{char?.name || '—'}</span></div>
      <div style={{ display: 'flex', gap: '8px', padding: '0 12px 12px' }}>
        <button className={`sm-btn ${simMethod === 'cosine' ? 'active' : ''}`} onClick={() => setSimMethod('cosine')}>Cosine</button>
        <button className={`sm-btn ${simMethod === 'euclidean' ? 'active' : ''}`} onClick={() => setSimMethod('euclidean')}>Euklides</button>
        <button className={`sm-btn ${simMethod === 'biometric' ? 'active' : ''}`} onClick={() => setSimMethod('biometric')}>Biometria</button>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <button className="btn btn-gold" onClick={handleComputeSimilarity}>Oblicz podobieństwo</button>
      </div>

      {simResults.length > 0 && (
        <div className="card">
          {simResults.map((r, i) => {
            const pct = (r.sim * 100).toFixed(1);
            const c = r.sim > .85 ? 'var(--grn)' : r.sim > .7 ? 'var(--gold)' : 'var(--red)';
            return (
              <div key={i} className="sim-row">
                <span className="sim-rank">{i + 1}</span>
                <span className="sim-name">{r.name}</span>
                <div className="sim-bar-w"><div className="sim-bar-f" style={{ width: `${pct}%`, background: c }}></div></div>
                <span className="sim-pct" style={{ color: c }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ height: '8px', flexShrink: 0 }}></div>
    </div>
  );
};
