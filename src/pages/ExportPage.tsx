import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useAppContext } from '../store/AppContext';
import { extractBioVec } from '../utils/biometrics';

export const ExportPage: React.FC = () => {
  const { logs, clearLogs, sysLog } = useAppContext();
  const [exportMode, setExportMode] = useState('points');
  const [exportQuality, setExportQuality] = useState(50);
  const [expNeutral, setExpNeutral] = useState(true);
  const [expAngle, setExpAngle] = useState(true);
  const [expMeta, setExpMeta] = useState(false);
  const [previewStats, setPreviewStats] = useState<any>(null);

  const handlePreview = async () => {
    const chars = await db.characters.toArray();
    let tIn = 0, tOut = 0;
    for (const ch of chars) {
      let sc = await db.history.where({ charId: ch.id! }).toArray();
      const b = sc.length;
      sc = sc.filter(s => (s.quality || 0) >= exportQuality);
      if (expNeutral) sc = sc.filter(s => (s.exprScore || 0) < 30);
      if (expAngle) sc = sc.filter(s => Math.abs(s.yaw || 0) < 35 && Math.abs(s.pitch || 0) < 25);
      tIn += b; tOut += sc.length;
    }
    setPreviewStats({ chars: chars.length, tIn, tOut, rejected: tIn - tOut });
  };

  const handleExport = async () => {
    const chars = await db.characters.toArray();
    const out: any = {};
    for (const ch of chars) {
      let sc = await db.history.where({ charId: ch.id! }).toArray();
      sc = sc.filter(s => (s.quality || 0) >= exportQuality);
      if (expNeutral) sc = sc.filter(s => (s.exprScore || 0) < 30);
      if (expAngle) sc = sc.filter(s => Math.abs(s.yaw || 0) < 35 && Math.abs(s.pitch || 0) < 25);
      if (!sc.length) continue;
      out[ch.name] = sc.map(s => {
        let vec: number[] = [];
        if (exportMode === 'points' || exportMode === 'combined') vec = vec.concat(s.points.flatMap(p => [p.x, p.y, p.z]));
        if (exportMode === 'biometric' || exportMode === 'combined') vec = vec.concat(extractBioVec(s.points));
        return expMeta ? { vector: vec, quality: s.quality, yaw: s.yaw, pitch: s.pitch, date: s.date } : vec;
      });
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'FaceDataset_v5_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url);
    sysLog(`Eksport OK (${exportMode}, ${Object.keys(out).length} postaci).`, 'ok');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target?.result as string); let aC = 0, aS = 0;
        for (const name in data) {
          let ch = await db.characters.where({ name }).first();
          if (!ch) { const id = await db.characters.add({ name }); ch = { id, name }; aC++; }
          for (const scan of data[name]) {
            const flat = Array.isArray(scan) ? scan : (scan.vector || []); const pts = [];
            for (let i = 0; i < flat.length; i += 3) pts.push({ x: flat[i] || 0, y: flat[i + 1] || 0, z: flat[i + 2] || 0 });
            await db.history.add({ charId: ch.id!, points: pts, quality: 50, yaw: 0, pitch: 0, roll: 0, exprScore: 0, date: Date.now() }); aS++;
          }
        }
        sysLog(`Import: ${aC} postaci, ${aS} skanów.`, 'ok');
      } catch (err: any) { sysLog('Błąd importu: ' + err.message, 'err'); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="page active" style={{ display: 'flex' }}>
      <div className="sh">Konfiguracja eksportu</div>
      <div className="card">
        <div className="card-body">
          <div className="field">
            <label>Format</label>
            <select value={exportMode} onChange={e => setExportMode(e.target.value)}>
              <option value="points">Punkty 3D — 1404 wartości</option>
              <option value="biometric">Cechy biometryczne — ~60</option>
              <option value="combined">Kombinowany — maks.</option>
            </select>
          </div>
          <div className="field">
            <label>Min. jakość</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="range" min="0" max="100" value={exportQuality} onChange={e => setExportQuality(Number(e.target.value))} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--acc)', width: '34px' }}>{exportQuality}%</span>
            </div>
          </div>
        </div>
        <div className="check-row"><input type="checkbox" id="exp-neutral" checked={expNeutral} onChange={e => setExpNeutral(e.target.checked)} /><label htmlFor="exp-neutral">Tylko skany neutralne (ekspresja &lt;30%)</label></div>
        <div className="check-row"><input type="checkbox" id="exp-angle" checked={expAngle} onChange={e => setExpAngle(e.target.checked)} /><label htmlFor="exp-angle">Odrzuć skany z odchyleniem &gt;35°</label></div>
        <div className="check-row"><input type="checkbox" id="exp-meta" checked={expMeta} onChange={e => setExpMeta(e.target.checked)} /><label htmlFor="exp-meta">Dołącz metadane</label></div>
      </div>

      <div style={{ padding: '4px 14px 8px', fontSize: '11px', color: 'var(--dim)', fontFamily: 'var(--mono)', lineHeight: 1.9, flexShrink: 0 }}>
        {previewStats && (
          <>Postaci: <span style={{ color: 'var(--acc)' }}>{previewStats.chars}</span> · Skanów: <span style={{ color: 'var(--txt)' }}>{previewStats.tIn}</span> · Po filtracji: <span style={{ color: 'var(--grn)' }}>{previewStats.tOut}</span> · Odrzucono: <span style={{ color: 'var(--red)' }}>{previewStats.rejected}</span></>
        )}
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <button className="btn btn-ghost" onClick={handlePreview}>Podgląd statystyk</button>
        <button className="btn btn-purple" onClick={handleExport}>⬇ Pobierz dataset (.json)</button>
      </div>

      <div className="divider"></div>
      <div className="sh">Import datasetu</div>
      <div style={{ padding: '0 12px 12px', flexShrink: 0 }}><input type="file" accept=".json" onChange={handleImport} /></div>

      <div className="divider"></div>
      <div className="sh">Log systemu
        <button onClick={clearLogs} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--dim)', padding: '3px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '9px', fontFamily: 'var(--mono)' }}>CLR</button>
      </div>
      <div className="log-box">
        {logs.map(log => (
          <div key={log.id}>
            <span style={{ color: 'var(--bdrB)' }}>[{log.time}]</span>{' '}
            <span style={{ color: log.type === 'ok' ? 'var(--grn)' : log.type === 'err' ? 'var(--red)' : log.type === 'warn' ? 'var(--gold)' : 'var(--dim)' }}>{log.msg}</span>
          </div>
        ))}
      </div>
      <div style={{ height: '8px', flexShrink: 0 }}></div>
    </div>
  );
};
