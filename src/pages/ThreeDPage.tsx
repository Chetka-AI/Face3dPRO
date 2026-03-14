import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAppContext } from '../store/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Point3D } from '../types';
import { computeAsymmetry } from '../utils/biometrics';
import { FACE_REGIONS } from '../utils/constants';

export const ThreeDPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewMode, setViewMode, currentCharId, currentScan, texCanvas, editKpts, lastTris } = useAppContext();
  
  const [stats, setStats] = useState({ v: 468, t: '—', z: '—', a: '—', s: '—' });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const meshesRef = useRef<{
    master: THREE.Points | null;
    cloud: THREE.Points | null;
    variance: THREE.Points | null;
    wire: THREE.Mesh | null;
    tex: THREE.Mesh | null;
    depth: THREE.Points | null;
    reg: THREE.Mesh | null;
  }>({ master: null, cloud: null, variance: null, wire: null, tex: null, depth: null, reg: null });

  const master = useLiveQuery(() => currentCharId ? db.masters.get(currentCharId) : undefined, [currentCharId]);
  const scans = useLiveQuery(() => currentCharId ? db.history.where({ charId: currentCharId }).toArray() : [], [currentCharId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const w = Math.max(c.clientWidth, 1), h = Math.max(c.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 5000);
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x05080f, 1); c.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(0, 2, 3); scene.add(dl);
    scene.add(new THREE.AxesHelper(40));
    const grid = new THREE.GridHelper(400, 20, 0x1a2840, 0x0d1525); grid.position.y = -150; scene.add(grid);

    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(468 * 3), 3));
    const masterMesh = new THREE.Points(mg, new THREE.PointsMaterial({ size: 3, color: 0x00e676, transparent: true, opacity: .9 }));
    scene.add(masterMesh);
    meshesRef.current.master = masterMesh;

    const cloudPoints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 1.5, color: 0x0070f3, transparent: true, opacity: .3 }));
    scene.add(cloudPoints);
    meshesRef.current.cloud = cloudPoints;

    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(468 * 3), 3));
    vg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(468 * 3), 3));
    const varianceMesh = new THREE.Points(vg, new THREE.PointsMaterial({ size: 4, vertexColors: true }));
    varianceMesh.visible = false; scene.add(varianceMesh);
    meshesRef.current.variance = varianceMesh;

    const resizeObs = new ResizeObserver(() => {
      if (!c || !renderer || !camera) return;
      const nw = c.clientWidth, nh = c.clientHeight;
      if (nw < 1 || nh < 1) return;
      renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix();
    });
    resizeObs.observe(c);

    let reqId: number;
    const loop = () => {
      reqId = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObs.disconnect();
      if (renderer.domElement && c.contains(renderer.domElement)) c.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Sync Master Mesh
  useEffect(() => {
    if (!meshesRef.current.master) return;
    const pts = currentScan?.points || master?.points;
    if (pts) {
      const p = new Float32Array(468 * 3);
      pts.forEach((pt, i) => { p[i * 3] = pt.x; p[i * 3 + 1] = pt.y; p[i * 3 + 2] = pt.z; });
      meshesRef.current.master.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
      meshesRef.current.master.geometry.attributes.position.needsUpdate = true;
      
      const asy = (computeAsymmetry(pts) * 100).toFixed(1);
      setStats(prev => ({ ...prev, a: asy }));

      // Build other meshes if we have editKpts and lastTris
      if (editKpts && lastTris && sceneRef.current) {
        const scene = sceneRef.current;
        const m = meshesRef.current;
        if (m.wire) { scene.remove(m.wire); m.wire.geometry.dispose(); (m.wire.material as THREE.Material).dispose(); }
        if (m.tex) { scene.remove(m.tex); m.tex.geometry.dispose(); (m.tex.material as THREE.Material).dispose(); }
        if (m.depth) { scene.remove(m.depth); m.depth.geometry.dispose(); (m.depth.material as THREE.Material).dispose(); }
        if (m.reg) { scene.remove(m.reg); m.reg.geometry.dispose(); (m.reg.material as THREE.Material).dispose(); }

        const tCount = lastTris.length;
        const idx = new Uint16Array(tCount * 3);
        lastTris.forEach(([a, b, c], i) => { idx[i * 3] = a; idx[i * 3 + 1] = b; idx[i * 3 + 2] = c; });

        const uv = new Float32Array(468 * 2);
        const imgW = texCanvas ? texCanvas.width : 1;
        const imgH = texCanvas ? texCanvas.height : 1;
        editKpts.forEach((pt, i) => {
          uv[i * 2] = Math.max(0, Math.min(1, pt.x / imgW));
          uv[i * 2 + 1] = Math.max(0, Math.min(1, 1.0 - pt.y / imgH));
        });

        const zv = pts.map(pt => pt.z), zMn = Math.min(...zv), zRng = Math.max(...zv) - zMn || 1;
        const dCol = new Float32Array(468 * 3);
        pts.forEach((pt, i) => {
          const t = (pt.z - zMn) / zRng;
          dCol[i * 3] = t > .5 ? 1 : t * 2; dCol[i * 3 + 1] = t < .5 ? t * 2 : (1 - t) * 2; dCol[i * 3 + 2] = t < .5 ? 1 - t * 2 : 0;
        });

        const RCOL = [[0, .9, 1], [0, .9, .4], [0, .9, .4], [1, .57, 0], [1, .18, .47], [.49, .3, 1]];
        const DEF = [.15, .25, .4];
        const mb = new Array(468).fill(-1);
        FACE_REGIONS.forEach((r, ri) => r.pts.forEach(i => { if (i < 468) mb[i] = ri; }));
        const rCol = new Float32Array(468 * 3);
        for (let i = 0; i < 468; i++) {
          const c = mb[i] >= 0 ? RCOL[mb[i]] : DEF;
          rCol[i * 3] = c[0]; rCol[i * 3 + 1] = c[1]; rCol[i * 3 + 2] = c[2];
        }

        const mkGeo = (withUV: boolean, withDC: boolean, withRC: boolean) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(p.slice(), 3));
          if (withUV) g.setAttribute('uv', new THREE.BufferAttribute(uv.slice(), 2));
          if (withDC) g.setAttribute('color', new THREE.BufferAttribute(dCol.slice(), 3));
          if (withRC) g.setAttribute('color', new THREE.BufferAttribute(rCol.slice(), 3));
          g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
          g.computeVertexNormals();
          return g;
        };

        m.wire = new THREE.Mesh(mkGeo(false, false, false), new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: .5 }));
        m.wire.visible = viewMode === 'mesh'; scene.add(m.wire);

        if (texCanvas) {
          const tex = new THREE.CanvasTexture(texCanvas);
          tex.flipY = false; tex.needsUpdate = true;
          m.tex = new THREE.Mesh(mkGeo(true, false, false), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
          m.tex.visible = viewMode === 'texture'; scene.add(m.tex);
        }

        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.BufferAttribute(p.slice(), 3));
        dg.setAttribute('color', new THREE.BufferAttribute(dCol.slice(), 3));
        m.depth = new THREE.Points(dg, new THREE.PointsMaterial({ size: 5, vertexColors: true }));
        m.depth.visible = viewMode === 'depth'; scene.add(m.depth);

        m.reg = new THREE.Mesh(mkGeo(false, false, true), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        m.reg.visible = viewMode === 'region'; scene.add(m.reg);

        setStats(prev => ({ ...prev, t: tCount.toString(), z: (Math.max(...zv) - Math.min(...zv)).toFixed(1) }));
      }
    }
  }, [master, currentScan, editKpts, lastTris, texCanvas, viewMode]);

  // Sync Cloud Mesh
  useEffect(() => {
    if (!meshesRef.current.cloud || !scans) return;
    if (!scans.length) { meshesRef.current.cloud.visible = false; return; }
    const p = new Float32Array(scans.length * 468 * 3);
    scans.forEach((s, si) => s.points.forEach((pt, pi) => { const i = (si * 468 + pi) * 3; p[i] = pt.x; p[i + 1] = pt.y; p[i + 2] = pt.z; }));
    meshesRef.current.cloud.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
    meshesRef.current.cloud.geometry.attributes.position.needsUpdate = true;
    meshesRef.current.cloud.visible = viewMode === 'cloud';
    setStats(prev => ({ ...prev, s: scans.length.toString() }));
  }, [scans, viewMode]);

  // Sync Variance Mesh
  useEffect(() => {
    if (!meshesRef.current.variance || !scans || scans.length < 2 || !master) return;
    const p = new Float32Array(468 * 3), c = new Float32Array(468 * 3);
    for (let i = 0; i < 468; i++) {
      const mx = master.points[i].x, my = master.points[i].y, mz = master.points[i].z;
      let vs = 0; scans.forEach(s => { const dx = s.points[i].x - mx, dy = s.points[i].y - my, dz = s.points[i].z - mz; vs += dx * dx + dy * dy + dz * dz; });
      const v = Math.min(1, Math.sqrt(vs / scans.length) / 15);
      p[i * 3] = mx; p[i * 3 + 1] = my; p[i * 3 + 2] = mz;
      c[i * 3] = v > .5 ? 1 : v * 2; c[i * 3 + 1] = v < .5 ? 1 : 2 - v * 2; c[i * 3 + 2] = 0;
    }
    meshesRef.current.variance.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
    meshesRef.current.variance.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
    meshesRef.current.variance.geometry.attributes.position.needsUpdate = true;
    meshesRef.current.variance.geometry.attributes.color.needsUpdate = true;
  }, [scans, master]);

  // Visibility toggle
  useEffect(() => {
    const m = meshesRef.current;
    if (m.master) m.master.visible = viewMode === 'master';
    if (m.cloud) m.cloud.visible = viewMode === 'cloud';
    if (m.variance) m.variance.visible = viewMode === 'variance';
    if (m.wire) m.wire.visible = viewMode === 'mesh';
    if (m.tex) m.tex.visible = viewMode === 'texture';
    if (m.depth) m.depth.visible = viewMode === 'depth';
    if (m.reg) m.reg.visible = viewMode === 'region';
  }, [viewMode]);

  return (
    <div className="page active" style={{ display: 'flex', overflow: 'hidden' }}>
      <div id="three-container" ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div className="vc-wrap">
          {['master', 'cloud', 'variance', 'mesh', 'texture', 'depth', 'region'].map(mode => (
            <button
              key={mode}
              className={`vc ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <div id="info-bar">
          <div className="chip">Wierz. <span>{stats.v}</span></div>
          <div className="chip">Trójk. <span>{stats.t}</span></div>
          <div className="chip">ZΔ <span>{stats.z}</span></div>
          <div className="chip">Asymetria <span>{stats.a}</span>%</div>
        </div>
      </div>
      <div id="var-legend" style={{ display: viewMode === 'variance' ? 'flex' : 'none', gap: '12px', justifyContent: 'center', fontSize: '10px', color: 'var(--dim)', fontFamily: 'var(--mono)', padding: '8px 12px', flexShrink: 0 }}>
        <span><span className="vl-dot" style={{ background: 'var(--grn)' }}></span>Stabilny</span>
        <span><span className="vl-dot" style={{ background: 'var(--gold)' }}></span>Średni</span>
        <span><span className="vl-dot" style={{ background: 'var(--red)' }}></span>Zmienny</span>
      </div>
      <div className="sh" style={{ flexShrink: 0 }}>Parametry modelu</div>
      <div className="ms-grid" style={{ flexShrink: 0 }}>
        <div className="ms-cell"><div className="ms-val">{stats.v}</div><div className="ms-label">Wierzchołki</div></div>
        <div className="ms-cell"><div className="ms-val">{stats.t}</div><div className="ms-label">Trójkąty</div></div>
        <div className="ms-cell"><div className="ms-val">{stats.s}</div><div className="ms-label">Skanów</div></div>
        <div className="ms-cell"><div className="ms-val">{stats.a}</div><div className="ms-label">Asymetria %</div></div>
      </div>
    </div>
  );
};
