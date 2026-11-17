// A 3D scene module for selfclone: one water molecule warming up until it breaks free as vapor.
// Used by examples/three/scenes.json ("three": {"module": "molecule.js"}). See src/studio/three/stage.js for the
// contract: setup(info) returns createStage(...), update(t) poses everything as a pure function of t.
import * as THREE from 'three';
import { createStage, makeMolecules, makePoints, cameraPath, prog, ease, rng, thermal, PALETTE } from 'selfclone/3d';

let mol, liquid, glow, lines;
const N = 140; // molecules in the liquid below

export default {
  setup(info) {
    lines = info.lines;
    const stage = createStage({ background: '#050b16', fog: { color: '#050b16', near: 8, far: 22 }, fov: 38, bloom: { strength: 0.6, radius: 0.45, threshold: 0.88 } });
    stage.scene.add(new THREE.HemisphereLight('#bfe3ff', '#0b1220', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(3, 5, 6); stage.scene.add(key);
    // The hero molecule and the liquid it sits in.
    mol = makeMolecules(1, { radius: 0.55, emissive: 0.05 });
    stage.scene.add(mol.group);
    liquid = makeMolecules(N, { radius: 0.16 });
    stage.scene.add(liquid.group);
    const r = rng(11);
    liquid.seeds = Array.from({ length: N }, () => ({ x: r.range(-4, 4), y: r.range(-6.5, -3.6), z: r.range(-3, 1.5), p: r() * 6.28, s: r.range(0.6, 1.4) }));
    // A heat glow around the hero molecule.
    glow = makePoints(1, { texture: 'soft' });
    stage.scene.add(glow.points);
    // Labels, timed by the spoken lines.
    const l1 = lines[0] || { start: 0 }, l2 = lines[1] || { start: 3 };
    stage.label('H₂O', 0.5, 0.18, { at: l1.start + 0.4, out: l2.start + 0.4, size: 64, weight: 700, color: PALETTE.water });
    stage.label('1 oxygen · 2 hydrogens', 0.5, 0.235, { at: l1.start + 1.6, out: l2.start + 0.4, size: 30, weight: 500, color: '#cfe3f5' });
    stage.label('faster = hotter', 0.5, 0.2, { at: l2.start + 0.8, out: l2.start + 3.2, size: 40, color: PALETTE.heat, chip: true });
    stage.label('breaks free: vapor', 0.5, 0.2, { at: l2.start + 3.4, size: 42, color: PALETTE.vapor });
    return stage;
  },
  update(t, stage) {
    const l2 = lines[1] || { start: 3, end: 6 };
    const heat = prog(t, l2.start + 0.3, l2.start + 2.8, ease.inOutSine); // 0 -> 1 as the second line plays
    const escape = prog(t, l2.start + 2.6, l2.start + 5, ease.inCubic);
    const jig = 0.04 + heat * 0.35;
    const y = escape * 9;
    mol.set(0, Math.sin(t * 9) * jig, y + Math.sin(t * 11 + 1) * jig, Math.cos(t * 7) * jig, t * 0.6 + heat * Math.sin(t * 13), t * 0.9, Math.sin(t * 0.7) * 0.4);
    mol.commit();
    mol.O.material.emissive.copy(thermal(0.25 + heat * 0.6)); mol.O.material.emissiveIntensity = 0.1 + heat * 0.9;
    glow.pos.set([0, y, 0]); glow.size[0] = 1.6 + heat * 0.9; glow.alpha[0] = 0.12 + heat * 0.35;
    thermal(0.3 + heat * 0.6, new THREE.Color()).toArray(glow.col, 0); glow.commit();
    liquid.seeds.forEach((s, i) => { const a = t * s.s + s.p; liquid.set(i, s.x + Math.sin(a) * 0.12, s.y + Math.cos(a * 1.3) * 0.12, s.z, a, a * 0.7, 0); });
    liquid.commit();
    cameraPath(stage.camera, [
      { t: 0, pos: [0, 0.4, 9], look: [0, 0, 0] },
      { t: l2.start + 2.4, pos: [1.4, 0.2, 6.2], look: [0, 0, 0] },
      { t: l2.start + 5.4, pos: [0.4, 1.2, 8.5], look: [0, 0.4, 0] },
    ], t);
    // Follow the molecule up as it escapes, so it stays in frame while the liquid falls away below.
    stage.camera.position.y += y * 0.92;
    stage.camera.lookAt(0, y * 0.95, 0);
  },
};
