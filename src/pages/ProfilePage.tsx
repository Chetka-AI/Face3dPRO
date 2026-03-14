import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useAppContext } from '../store/AppContext';

export const ProfilePage: React.FC = () => {
  const { currentCharId, setCurrentCharId, sysLog } = useAppContext();
  const [charName, setCharName] = useState('');
  const [minQuality, setMinQuality] = useState(60);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const characters = useLiveQuery(() => db.characters.toArray()) || [];
  const scans = useLiveQuery(() => currentCharId ? db.history.where({ charId: currentCharId }).toArray() : []) || [];
  const master = useLiveQuery(() => currentCharId ? db.masters.get(currentCharId) : undefined, [currentCharId]);

  const filteredScans = scans.filter(s => s.quality >= minQuality);
  const goodScans = scans.filter(s => s.quality >= 70).length;
  const avgQuality = scans.length ? scans.reduce((a, b) => a + b.quality, 0) / scans.length : 0;

  const handleCreate = async () => {
    const n = charName.trim();
    if (!n) return;
    await db.characters.add({ name: n });
    setCharName('');
    sysLog(`Profil "${n}" utworzony.`, 'ok');
  };

  const handleDeleteScan = async () => {
    if (!deleteId) return;
    await db.history.delete(deleteId);
    setDeleteId(null);
  };

  const handleGenerateModel = async () => {
    if (!currentCharId) { sysLog('Wybierz profil!', 'warn'); return; }
    if (!filteredScans.length) { sysLog(`Brak skanów ≥${minQuality}%.`, 'warn'); return; }
    
    const w = filteredScans.map(s => Math.pow(s.quality / 100, 2));
    const tW = w.reduce((a, b) => a + b, 0);
    const av = [];
    
    for (let i = 0; i < 468; i++) {
      let wx = 0, wy = 0, wz = 0;
      filteredScans.forEach((s, si) => {
        wx += s.points[i].x * w[si];
        wy += s.points[i].y * w[si];
        wz += s.points[i].z * w[si];
      });
      av.push({ x: wx / tW, y: wy / tW, z: wz / tW });
    }
    
    await db.masters.put({ charId: currentCharId, points: av, scanCount: filteredScans.length, date: Date.now() });
    sysLog(`Model z ${filteredScans.length} skanów.`, 'ok');
  };

  return (
    <div className="page active" style={{ display: 'flex' }}>
      <div className="sh">Profil postaci</div>
      <div className="card">
        <div className="card-body">
          <div className="field">
            <label>Nowa postać</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={charName} onChange={e => setCharName(e.target.value)} placeholder="Imię / nazwisko" style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={handleCreate}>+ Utwórz</button>
            </div>
          </div>
          <div className="field">
            <label>Aktywny profil</label>
            <select value={currentCharId || ''} onChange={e => setCurrentCharId(Number(e.target.value) || null)}>
              <option value="">-- wybierz profil --</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-cell"><div className="stat-val" style={{ color: 'var(--acc)' }}>{scans.length}</div><div className="stat-label">Skanów</div></div>
        <div className="stat-cell"><div className="stat-val" style={{ color: 'var(--gold)' }}>{scans.length ? avgQuality.toFixed(0) + '%' : '—'}</div><div className="stat-label">Śr. jakość</div></div>
        <div className="stat-cell"><div className="stat-val" style={{ color: 'var(--grn)' }}>{goodScans}</div><div className="stat-label">Dobre ≥70%</div></div>
        <div className="stat-cell"><div className="stat-val" style={{ color: master ? 'var(--grn)' : 'var(--dim)' }}>{master ? '✓' : '✗'}</div><div className="stat-label">Model</div></div>
      </div>

      <div className="sh">Historia skanów <span className="badge">{scans.length}</span></div>
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '160px', overflow: 'hidden' }}>
        <div className="filter-row">
          <label>Min. jakość:</label>
          <input type="range" min="0" max="100" value={minQuality} onChange={e => setMinQuality(Number(e.target.value))} style={{ flex: 1 }} />
          <span className="fval">{minQuality}%</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {scans.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--dim)', fontSize: '12px', fontFamily: 'var(--mono)' }}>Brak skanów</div>
          ) : (
            scans.map((s, i) => {
              const q = s.quality || 0;
              const cls = q >= 70 ? 'qr-great' : q >= 50 ? 'qr-ok' : 'qr-bad';
              const dim = q < minQuality;
              const badges = [];
              if (s.exprScore > 30) badges.push(<span key="expr" className="scan-badge sb-expr">EXPR</span>);
              if (Math.abs(s.yaw || 0) > 35) badges.push(<span key="angle" className="scan-badge sb-angle">ANGLE</span>);
              if (!badges.length) badges.push(<span key="ok" className="scan-badge sb-ok">OK</span>);

              return (
                <div key={s.id} className="scan-entry" style={{ opacity: dim ? 0.3 : 1 }}>
                  <div className={`quality-ring ${cls}`}>{q}</div>
                  <div className="scan-meta">
                    <div className="scan-name">Skan #{i + 1}</div>
                    <div className="scan-detail">yaw: {(s.yaw || 0).toFixed(0)}° · exp: {(s.exprScore || 0).toFixed(0)}%</div>
                  </div>
                  {badges}
                  <button className="del-btn" onClick={() => setDeleteId(s.id!)}>×</button>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div style={{ padding: '12px' }}>
        <button className="btn btn-accent" onClick={handleGenerateModel}>⊕ Generuj model ważony</button>
      </div>
      <div style={{ height: '4px', flexShrink: 0 }}></div>

      {deleteId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '20px', maxWidth: '300px', width: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Potwierdzenie</h3>
            <p style={{ marginBottom: '20px', color: 'var(--dim)' }}>Czy na pewno chcesz usunąć ten skan?</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Anuluj</button>
              <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={handleDeleteScan}>Usuń</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
