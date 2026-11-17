// The smallest 3D scene: used to check which WebGL renderer the 3D pages get (gpuInfo) and by the tests.
import * as THREE from 'three';
import { createStage } from 'selfclone/3d';

let cube;
export default {
  setup() {
    const stage = createStage({ background: '#0b1220', bloom: false, env: false, samples: 0 });
    cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshNormalMaterial());
    stage.scene.add(cube);
    stage.camera.position.set(0, 0, 6);
    return stage;
  },
  update(t) {
    cube.rotation.set(t * 0.9, t * 1.3, 0);
  },
};
