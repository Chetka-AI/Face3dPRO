import React, { useEffect, useRef, useState } from 'react';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import '@tensorflow/tfjs';
import * as THREE from 'three';
import { useAppContext } from '../store/AppContext';
import { db } from '../db';
import { Point2D, Point3D, ScanData } from '../types';
import { delaunay, normalizeFace, computeAngles, computeExpr, evalQuality, exprTotal, computeSpatialMetrics } from '../utils/geometry';
import { LM, FACE_OVAL_IDX, FACE_REGIONS } from '../utils/constants';

let detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;

export const ScanPage: React.FC = () => {
  const { sysLog, setLed, currentCharId, currentScan, setCurrentScan, setViewMode, setActiveTab, setTexCanvas, editKpts, setEditKpts, lastTris, setLastTris } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null);
  const [imgW, setImgW] = useState(1);
  const [imgH, setImgH] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [vpZoom, setVpZoom] = useState(1);
  const [vpPanX, setVpPanX] = useState(0);
  const [vpPanY, setVpPanY] = useState(0);
  const [layers, setLayers] = useState({ mesh: true, tiles: false, pts: true, depth: false, zones: false, golden: false });
  
  const [origKpts, setOrigKpts] = useState<Point3D[] | null>(null);
  const [normPts, setNormPts] = useState<Point3D[] | null>(null);
  const [inputMode, setInputMode] = useState<'upload' | 'camera'>('upload');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraState, setCameraState] = useState<'off' | 'starting' | 'on'>('off');

  const resetScanState = () => {
    setEditKpts(null);
    setOrigKpts(null);
    setNormPts(null);
    setLastTris(null);
    setCurrentScan(null);
  };

  const setSourceImage = (img: HTMLImageElement) => {
    setImgW(img.naturalWidth || img.width || 1);
    setImgH(img.naturalHeight || img.height || 1);
    setSrcImg(img);
    resetScanState();
  };

  useEffect(() => {
    const initAI = async () => {
      setLed('ai', 'warn');
      try {
        detector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', refineLandmarks: true, maxFaces: 1 }
        );
        setLed('ai', 'on');
        sysLog('MediaPipe FaceMesh OK.', 'ok');
      } catch (e: any) {
        setLed('ai', 'err');
        sysLog('AI błąd: ' + e.message, 'err');
      }
    };
    initAI();
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(e.target.files[0]);
  };

  const stopCamera = (setState = true) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (setState) setCameraState('off');
  };

  const startCamera = async (facing: 'user' | 'environment' = cameraFacing) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      sysLog('Ta przeglądarka nie wspiera getUserMedia.', 'err');
      return;
    }
    stopCamera(false);
    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState('on');
      sysLog(`Kamera aktywna (${facing === 'user' ? 'przednia' : 'tylna'}).`, 'ok');
    } catch (e: any) {
      setCameraState('off');
      sysLog('Błąd kamery: ' + e.message, 'err');
    }
  };

  const handleSwitchCamera = async () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    await startCamera(nextFacing);
  };

  const handleCaptureFrame = () => {
    const v = videoRef.current;
    if (!v || cameraState !== 'on') {
      sysLog('Najpierw uruchom kamerę.', 'warn');
      return;
    }
    if (!v.videoWidth || !v.videoHeight) {
      sysLog('Kamera jeszcze inicjalizuje obraz.', 'warn');
      return;
    }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    const img = new Image();
    img.onload = () => setSourceImage(img);
    img.src = c.toDataURL('image/jpeg', 0.95);
    sysLog('Klatka przechwycona z kamery.', 'ok');
  };

  useEffect(() => () => { stopCamera(); }, []);

  useEffect(() => {
    if (!srcImg || !canvasRef.current || !wrapRef.current) return;
    const maxW = wrapRef.current.offsetWidth || (window.innerWidth - 24);
    const rawH = Math.round(maxW * imgH / imgW);
    const cv = canvasRef.current;
    cv.width = maxW;
    cv.height = Math.min(rawH, Math.round(window.innerHeight * 0.65));
    wrapRef.current.style.height = cv.height + 'px';
    
    setVpZoom(1); setVpPanX(0);
    const s = cv.width / imgW;
    setVpPanY((cv.height - imgH * s) / 2);
    
    redraw();
  }, [srcImg, imgW, imgH]);

  const redraw = () => {
    if (!canvasRef.current || !srcImg) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const s = (cv.width / imgW) * vpZoom;
    const tx = vpPanX, ty = vpPanY;

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.drawImage(srcImg, 0, 0, imgW, imgH);

    if (editKpts) {
      if (layers.tiles && lastTris) {
        lastTris.forEach(([a, b, c], i) => {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(0,229,255,0.12)' : 'rgba(0,230,118,0.09)';
          ctx.beginPath();
          ctx.moveTo(editKpts[a].x, editKpts[a].y);
          ctx.lineTo(editKpts[b].x, editKpts[b].y);
          ctx.lineTo(editKpts[c].x, editKpts[c].y);
          ctx.closePath(); ctx.fill();
        });
      }

      if (layers.mesh && lastTris) {
        ctx.strokeStyle = 'rgba(0,229,255,0.4)';
        ctx.lineWidth = 0.6 / s;
        lastTris.forEach(([a, b, c]) => {
          ctx.beginPath();
          ctx.moveTo(editKpts[a].x, editKpts[a].y);
          ctx.lineTo(editKpts[b].x, editKpts[b].y);
          ctx.lineTo(editKpts[c].x, editKpts[c].y);
          ctx.closePath(); ctx.stroke();
        });
        ctx.strokeStyle = 'rgba(255,202,40,0.6)';
        ctx.lineWidth = 1.2 / s;
        ctx.setLineDash([5 / s, 4 / s]);
        ctx.beginPath();
        FACE_OVAL_IDX.forEach((idx, i) => { const p = editKpts[idx]; i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
        ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      }

      if (layers.zones) {
        const ZC = ['rgba(0,229,255,.35)', 'rgba(0,230,118,.45)', 'rgba(0,230,118,.45)', 'rgba(255,145,0,.38)', 'rgba(255,45,120,.42)', 'rgba(124,77,255,.32)'];
        FACE_REGIONS.forEach((region, ri) => {
          if (region.pts.length < 3) return;
          ctx.fillStyle = ZC[ri];
          ctx.beginPath();
          region.pts.forEach((idx, i) => { const p = editKpts[idx]; i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
          ctx.closePath(); ctx.fill();
        });
      }

      if (layers.depth && normPts) {
        const zv = normPts.map(p => p.z), zMin = Math.min(...zv), zRange = Math.max(...zv) - zMin || 1;
        const r = 3 / s;
        editKpts.forEach((p, i) => {
          const t = (normPts[i].z - zMin) / zRange;
          const R = Math.round(t > .5 ? 255 : t * 510), G = Math.round(t < .5 ? t * 510 : (1 - t) * 510), B = Math.round(t < .5 ? 255 - t * 510 : 0);
          ctx.fillStyle = `rgba(${R},${G},${B},0.8)`;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        });
      }

      if (layers.golden) {
        const T = editKpts[LM.TOP].y, B = editKpts[LM.BOTTOM].y;
        const Le = editKpts[LM.LEFT].x, R = editKpts[LM.RIGHT].x;
        const H = B - T, W = R - Le;
        if (H > 5 && W > 5) {
          ctx.save(); ctx.setLineDash([5 / s, 4 / s]); ctx.lineWidth = 1.1 / s;
          ctx.strokeStyle = 'rgba(255,202,40,.5)';
          [1 / 3, 2 / 3].forEach(f => {
            ctx.beginPath(); ctx.moveTo(Le - W * .05, T + H * f); ctx.lineTo(R + W * .05, T + H * f); ctx.stroke();
          });
          const g = W / 1.618;
          [Le + g, R - g].forEach(x => {
            ctx.beginPath(); ctx.moveTo(x, T - H * .05); ctx.lineTo(x, B + H * .05); ctx.stroke();
          });
          ctx.strokeStyle = 'rgba(255,202,40,.2)'; ctx.strokeRect(Le, T, W, H);
          ctx.setLineDash([]); ctx.restore();
        }
      }

      if (layers.pts) {
        const r = editMode ? 4 / s : 1.8 / s;
        editKpts.forEach((p, i) => {
          let col = 'rgba(0,229,255,.65)';
          if (i >= 130 && i <= 163) col = 'rgba(0,230,118,.9)';
          if (i >= 359 && i <= 387) col = 'rgba(0,230,118,.9)';
          if (i >= 0 && i <= 17) col = 'rgba(255,45,120,.9)';
          if (i === 4) col = 'rgba(255,145,0,1)';
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          if (editMode) {
            ctx.strokeStyle = 'rgba(0,229,255,.3)';
            ctx.lineWidth = 0.7 / s;
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2); ctx.stroke();
          }
        });
      }
    }
    ctx.restore();
  };

  useEffect(() => { redraw(); }, [vpZoom, vpPanX, vpPanY, editKpts, layers, editMode]);

  const isDownRef = useRef(false);
  const dragPtRef = useRef(-1);
  const startPosRef = useRef({ x: 0, y: 0 });

  const getPos = (e: React.MouseEvent | React.TouchEvent | WheelEvent | MouseEvent | TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    let cx, cy;
    if ('touches' in e) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = (e as React.MouseEvent | MouseEvent).clientX;
      cy = (e as React.MouseEvent | MouseEvent).clientY;
    }
    return { x: cx - r.left, y: cy - r.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!editKpts || !canvasRef.current) return;
    isDownRef.current = true;
    const p = getPos(e);
    startPosRef.current = p;
    
    if (editMode) {
      const s = (canvasRef.current.width / imgW) * vpZoom;
      const tx = vpPanX, ty = vpPanY;
      let minDist = 15;
      dragPtRef.current = -1;
      
      editKpts.forEach((pt, i) => {
        const px = pt.x * s + tx;
        const py = pt.y * s + ty;
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < minDist) {
          minDist = d;
          dragPtRef.current = i;
        }
      });
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDownRef.current || !canvasRef.current) return;
    
    const p = getPos(e);
    const dx = p.x - startPosRef.current.x;
    const dy = p.y - startPosRef.current.y;
    
    if (editMode && dragPtRef.current > -1 && editKpts) {
      const s = (canvasRef.current.width / imgW) * vpZoom;
      const newKpts = [...editKpts];
      newKpts[dragPtRef.current] = {
        ...newKpts[dragPtRef.current],
        x: newKpts[dragPtRef.current].x + dx / s,
        y: newKpts[dragPtRef.current].y + dy / s
      };
      setEditKpts(newKpts);
    } else if (panMode || (!editMode && !panMode)) {
      setVpPanX(prev => prev + dx);
      setVpPanY(prev => prev + dy);
    }
    
    startPosRef.current = p;
  };

  const handlePointerUp = () => {
    isDownRef.current = false;
    dragPtRef.current = -1;
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = getPos(e);
      setVpZoom(prevZoom => {
        const s = (cv.width / imgW) * prevZoom;
        const mx = (p.x - vpPanX) / s;
        const my = (p.y - vpPanY) / s;
        const z = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.5, Math.min(20, prevZoom * z));
        const ns = (cv.width / imgW) * newZoom;
        
        setVpPanX(p.x - mx * ns);
        setVpPanY(p.y - my * ns);
        
        return newZoom;
      });
    };

    cv.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      cv.removeEventListener('wheel', handleWheel);
    };
  }, [imgW, vpPanX, vpPanY]); // Need these dependencies for correct wheel calculation

  const handleAnalyze = async () => {
    if (!currentCharId) { sysLog('Wybierz profil!', 'warn'); return; }
    if (!detector) { sysLog('AI nie gotowe.', 'err'); return; }
    if (!srcImg || !canvasRef.current) return;
    
    setIsAnalyzing(true);
    setLed('scan', 'warn'); sysLog('Analiza...', 'info');
    
    try {
      const faces = await detector.estimateFaces(srcImg);
      if (!faces || !faces.length) { setLed('scan', 'err'); sysLog('Nie wykryto twarzy.', 'err'); setIsAnalyzing(false); return; }
      
      const kpts = faces[0].keypoints;
      const oKpts = kpts.map(k => ({ x: k.x, y: k.y, z: k.z || 0, name: k.name || '' }));
      const eKpts = oKpts.map(k => ({ x: k.x, y: k.y }));
      
      const raw3D = kpts.map(k => new THREE.Vector3(k.x, k.y, k.z || 0));
      const kpN: any = {}; kpts.forEach(k => { if (k.name) kpN[k.name] = new THREE.Vector3(k.x, k.y, k.z || 0); });
      const nPts = normalizeFace(raw3D);
      const tris = delaunay(eKpts);
      
      const texCv = document.createElement('canvas');
      texCv.width = imgW; texCv.height = imgH;
      texCv.getContext('2d')?.drawImage(srcImg, 0, 0);
      setTexCanvas(texCv);

      const angles = computeAngles(raw3D, kpN);
      const expr = computeExpr(raw3D);
      if (expr) expr.overall = exprTotal(expr);
      const quality = evalQuality(raw3D, canvasRef.current, angles, expr);
      const spatial = computeSpatialMetrics(raw3D);
      
      setOrigKpts(oKpts); setEditKpts(eKpts); setNormPts(nPts); setLastTris(tris);
      setCurrentScan({ points: nPts, quality, angles, expr, charId: currentCharId, spatial });
      
      setLed('scan', 'on');
      const spread = spatial ? spatial.depthSpread.toFixed(3) : '—';
      sysLog(`OK q:${quality.total}% yaw:${angles.yaw.toFixed(1)}° tris:${tris.length} zσ:${spread}`, 'ok');
    } catch (e: any) {
      setLed('scan', 'err'); sysLog('Błąd: ' + e.message, 'err');
    }
    setIsAnalyzing(false);
  };

  const handleApplyTo3D = () => {
    if (!editKpts) return;
    setLastTris(delaunay(editKpts));
    setActiveTab('3d');
    setViewMode('texture');
    sysLog('Zastosowano edycję → SKÓRA.', 'ok');
  };

  const handleConfirm = async () => {
    if (!currentScan) return;
    const { points, quality, angles, expr, charId } = currentScan;
    await db.history.add({
      charId, points, quality: quality.total,
      yaw: parseFloat(angles.yaw.toFixed(2)), pitch: parseFloat(angles.pitch.toFixed(2)), roll: parseFloat(angles.roll.toFixed(2)),
      exprScore: expr ? parseFloat((exprTotal(expr) * 100).toFixed(1)) : 0, date: Date.now()
    });
    setCurrentScan(null);
    sysLog(`Skan zatwierdzony (${quality.total}%).`, 'ok');
    setLed('scan', 'on');
  };

  const handleReject = () => {
    setCurrentScan(null);
    setLed('scan', 'warn');
    sysLog('Skan odrzucony.', 'warn');
  };

  return (
    <div className="page active" style={{ display: 'flex' }}>
      <div className="sh">Źródło obrazu</div>
      <div className="scan-src-row">
        <button
          className={`tb ${inputMode === 'upload' ? 'on' : ''}`}
          onClick={() => { setInputMode('upload'); stopCamera(); }}
        >
          📁 Plik
        </button>
        <button
          className={`tb ${inputMode === 'camera' ? 'on' : ''}`}
          onClick={() => { setInputMode('camera'); startCamera(); }}
        >
          📷 Kamera
        </button>
      </div>

      {inputMode === 'upload' ? (
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <input type="file" accept="image/*" onChange={handleUpload} />
        </div>
      ) : (
        <div className="camera-box">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="camera-actions">
            <button className="tb" onClick={() => startCamera()} disabled={cameraState === 'starting'}>
              {cameraState === 'on' ? 'Odśwież stream' : cameraState === 'starting' ? 'Uruchamianie...' : 'Start'}
            </button>
            <button className="tb" onClick={handleSwitchCamera} disabled={cameraState !== 'on'}>↺ Kamera</button>
            <button className="tb go" onClick={handleCaptureFrame} disabled={cameraState !== 'on'}>● Klatka</button>
          </div>
        </div>
      )}

      <div id="editor-wrap" ref={wrapRef}>
        <canvas 
          id="view-2d" 
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        ></canvas>
        {currentScan && (
          <div id="q-overlay" style={{ display: 'flex' }}>
            <span style={{ fontWeight: 600, fontSize: '15px', color: currentScan.quality.total >= 70 ? 'var(--grn)' : currentScan.quality.total >= 50 ? 'var(--gold)' : 'var(--red)' }}>{currentScan.quality.total}%</span>
            <span style={{ opacity: .75, color: currentScan.quality.total >= 70 ? 'var(--grn)' : currentScan.quality.total >= 50 ? 'var(--gold)' : 'var(--red)' }}>{currentScan.quality.total >= 70 ? 'DOBRY' : currentScan.quality.total >= 50 ? 'ŚREDNI' : 'SŁABY'}</span>
          </div>
        )}
        <div id="zoom-badge" style={{ display: srcImg ? 'block' : 'none' }}>{Math.round(vpZoom * 100)}%</div>
      </div>

      {currentScan && (
        <div className="tbar show">
          <div className="tstat">{editMode ? 'EDYCJA — przeciągnij punkt. Pinch/kółko = zoom' : panMode ? 'PAN — przeciągnij aby przewijać' : 'Podgląd — ✏ Edytuj = edycja punktów'}</div>
          <div className="trow">
            <button className={`tb ${editMode ? 'on' : ''}`} onClick={() => { setEditMode(!editMode); setPanMode(false); }}>✏ Edytuj</button>
            <button className={`tb ${panMode ? 'on' : ''}`} onClick={() => { setPanMode(!panMode); setEditMode(false); }}>✋ Pan</button>
            <div style={{ flex: 1 }}></div>
            <button className="tb zoom" onClick={() => setVpZoom(z => Math.min(20, z * 1.3))}>+</button>
            <button className="tb zoom" onClick={() => setVpZoom(z => Math.max(0.5, z * 0.77))}>−</button>
            <button className="tb zoom" onClick={() => { setVpZoom(1); setVpPanX(0); setVpPanY((canvasRef.current!.height - imgH * (canvasRef.current!.width / imgW)) / 2); }}>⌂</button>
          </div>
          <div className="trow">
            <label>Warstwy:</label>
            <button className={`tb ${layers.mesh ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, mesh: !l.mesh }))}>⬡ Siatka</button>
            <button className={`tb ${layers.tiles ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, tiles: !l.tiles }))}>▦ Kafelki</button>
            <button className={`tb ${layers.pts ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, pts: !l.pts }))}>· Punkty</button>
            <button className={`tb ${layers.depth ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, depth: !l.depth }))}>🌡 Z</button>
            <button className={`tb ${layers.zones ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, zones: !l.zones }))}>◑ Strefy</button>
            <button className={`tb ${layers.golden ? 'on' : ''}`} onClick={() => setLayers(l => ({ ...l, golden: !l.golden }))}>φ Złota</button>
          </div>
          <div className="trow">
            <button className="tb warn" onClick={() => { if (origKpts) setEditKpts(origKpts.map(k => ({ x: k.x, y: k.y }))); }}>↺ Reset pkt</button>
            <button className="tb go" onClick={handleApplyTo3D}>▷ Zastosuj → 3D</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
        <button className="btn btn-primary" disabled={!srcImg || isAnalyzing} onClick={handleAnalyze}>
          {isAnalyzing ? 'Analizowanie...' : '▷ Analizuj twarz'}
        </button>
      </div>

      {currentScan && (
        <>
          <div>
            <div className="sh">Jakość skanu</div>
            <div className="card">
              <div className="q-big">
                <div className={`q-big-score ${currentScan.quality.total >= 70 ? 'qs-great' : currentScan.quality.total >= 50 ? 'qs-ok' : 'qs-bad'}`}>{currentScan.quality.total}%</div>
                <div className="q-big-info">
                  <div className="q-big-label" style={{ color: currentScan.quality.total >= 70 ? 'var(--grn)' : currentScan.quality.total >= 50 ? 'var(--gold)' : 'var(--red)' }}>{currentScan.quality.total >= 70 ? 'DOBRA JAKOŚĆ' : currentScan.quality.total >= 50 ? 'AKCEPTOWALNA' : 'ZŁA JAKOŚĆ'}</div>
                  <div className="q-big-verdict">{currentScan.quality.total >= 70 ? '✓ zalecany' : currentScan.quality.total >= 50 ? '~ ostrożnie' : '✗ odrzuć'}</div>
                </div>
              </div>
              <div style={{ padding: '0 14px 14px' }}>
                <div className="qbar-row"><span className="qbar-name">Ostrość</span><div className="qbar-track"><div className="qbar-fill" style={{ background: 'var(--acc)', width: `${currentScan.quality.sharp * 100}%` }}></div></div><span className="qbar-val">{(currentScan.quality.sharp * 100).toFixed(0)}%</span></div>
                <div className="qbar-row"><span className="qbar-name">Kompletność</span><div className="qbar-track"><div className="qbar-fill" style={{ background: 'var(--grn)', width: `${currentScan.quality.comp * 100}%` }}></div></div><span className="qbar-val">{(currentScan.quality.comp * 100).toFixed(0)}%</span></div>
                <div className="qbar-row"><span className="qbar-name">Kąt głowy</span><div className="qbar-track"><div className="qbar-fill" style={{ background: 'var(--gold)', width: `${currentScan.quality.aScore * 100}%` }}></div></div><span className="qbar-val">{(currentScan.quality.aScore * 100).toFixed(0)}%</span></div>
                <div className="qbar-row"><span className="qbar-name">Symetria</span><div className="qbar-track"><div className="qbar-fill" style={{ background: 'var(--pur)', width: `${currentScan.quality.symm * 100}%` }}></div></div><span className="qbar-val">{(currentScan.quality.symm * 100).toFixed(0)}%</span></div>
                <div className="qbar-row"><span className="qbar-name">Ekspresja</span><div className="qbar-track"><div className="qbar-fill" style={{ background: 'var(--amber)', width: `${currentScan.quality.eScore * 100}%` }}></div></div><span className="qbar-val">{(currentScan.quality.eScore * 100).toFixed(0)}%</span></div>
              </div>
            </div>
          </div>

          {currentScan.spatial && (
            <div>
              <div className="sh">Relacje przestrzenne 3D</div>
              <div className="bio-grid">
                <div className="bio-cell"><div className="bio-name">Rozrzut głębi (Zσ)</div><div className="bio-value">{currentScan.spatial.depthSpread.toFixed(3)}</div></div>
                <div className="bio-cell"><div className="bio-name">Projekcja nosa</div><div className="bio-value">{currentScan.spatial.noseProjection.toFixed(3)}</div></div>
                <div className="bio-cell"><div className="bio-name">Odchyłka od płaszczyzny</div><div className="bio-value">{currentScan.spatial.facePlaneDeviation.toFixed(3)}</div></div>
                <div className="bio-cell"><div className="bio-name">Różnica głębi oczu</div><div className="bio-value">{currentScan.spatial.eyeDepthDelta.toFixed(3)}</div></div>
                <div className="bio-cell"><div className="bio-name">Szer. żuchwy / głębia</div><div className="bio-value">{currentScan.spatial.jawWidthToDepth.toFixed(3)}</div></div>
                <div className="bio-cell"><div className="bio-name">Skośność perspektywy</div><div className="bio-value">{currentScan.spatial.perspectiveSkew.toFixed(3)}</div></div>
              </div>
            </div>
          )}

          <div style={{ padding: '0 12px 12px' }}>
            <div className="confirm-card">
              <div className="confirm-verdict">
                {currentScan.quality.total >= 70 ? <span className="cv-ok">✓ Wysoka jakość — zalecany</span> : currentScan.quality.total >= 50 ? <span className="cv-warn">⚠ {currentScan.quality.total}% — ostrożnie</span> : <span className="cv-bad">✗ Niska: {currentScan.quality.total}% — odrzuć</span>}
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleConfirm}>✓ Zatwierdź</button>
                <button className="btn btn-ghost" onClick={handleReject}>✕ Odrzuć</button>
              </div>
            </div>
          </div>
        </>
      )}
      <div style={{ height: '8px', flexShrink: 0 }}></div>
    </div>
  );
};
