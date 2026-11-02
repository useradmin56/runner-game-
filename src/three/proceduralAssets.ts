import * as THREE from 'three';
import { CHASSIS_SKINS, VISOR_OPTICS, JET_TRAILS } from '../data/customizationData';
import { SuitLoadout } from '../types/game';

export function createSandstoneTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm travertine base
  ctx.fillStyle = '#D7B38C';
  ctx.fillRect(0, 0, 512, 512);

  // Sedimentary strata bands
  for (let y = 0; y < 512; y += 8) {
    const tone = Math.sin(y * 0.04) * 14 + (Math.random() - 0.5) * 10;
    const r = Math.min(255, Math.max(0, 215 + tone));
    const g = Math.min(255, Math.max(0, 178 + tone * 0.85));
    const b = Math.min(255, Math.max(0, 138 + tone * 0.7));
    ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    ctx.fillRect(0, y, 512, 8);
  }

  // Carved stone block seams
  ctx.strokeStyle = 'rgba(72, 50, 34, 0.38)';
  ctx.lineWidth = 3;
  const rows = 4;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();

    const offset = (r % 2) * 128;
    for (let x = offset; x < 512; x += 256) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTrackRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Sun-baked aqueduct stone deck
  ctx.fillStyle = '#B8926A';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle stone Flagstone grid
  ctx.strokeStyle = 'rgba(56, 38, 24, 0.32)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Three-lane solar conduit inlay lines
  const laneX = [106, 256, 406];
  laneX.forEach((x) => {
    ctx.fillStyle = 'rgba(78, 54, 36, 0.45)';
    ctx.fillRect(x - 10, 0, 20, 512);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.fillRect(x - 2, 0, 4, 512);
  });

  // Lane divider stone ribs
  [181, 331].forEach((divX) => {
    ctx.fillStyle = 'rgba(62, 43, 29, 0.55)';
    ctx.fillRect(divX - 4, 0, 8, 512);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCrackedBarrierTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#574335';
  ctx.fillRect(0, 0, 256, 256);

  // Glowing golden-cyan fracture lines indicating Dash-Breakable monolith
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const cracks = [
    [
      [128, 20],
      [112, 85],
      [145, 135],
      [118, 200],
      [135, 240],
    ],
    [
      [112, 85],
      [60, 120],
      [30, 165],
    ],
    [
      [145, 135],
      [200, 110],
      [230, 150],
    ],
    [
      [118, 200],
      [70, 225],
    ],
  ];

  cracks.forEach((path) => {
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 2;
  cracks.forEach((path) => {
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface CyberRunnerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftJetFlame: THREE.Mesh;
  rightJetFlame: THREE.Mesh;
  shieldDome: THREE.Mesh;
  primaryMat: THREE.MeshPhysicalMaterial;
  secondaryMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  jetCoreMat: THREE.MeshBasicMaterial;
}

export function createCyberRunnerRig(): CyberRunnerRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: 0xe5a93c,
    metalness: 0.85,
    roughness: 0.22,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0x3a2e28,
    metalness: 0.5,
    roughness: 0.55,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c2,
    metalness: 0.9,
    roughness: 0.18,
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
    roughness: 0.1,
    metalness: 0.2,
  });

  const jetCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
  });

  // 1. Torso Core & Beveled Chest Armor (ExtrudeGeometry)
  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.34, -0.32);
  chestShape.lineTo(0.34, -0.32);
  chestShape.lineTo(0.44, 0.28);
  chestShape.lineTo(0.22, 0.44);
  chestShape.lineTo(-0.22, 0.44);
  chestShape.lineTo(-0.44, 0.28);
  chestShape.closePath();

  const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  chestGeo.center();
  const torsoMesh = new THREE.Mesh(chestGeo, primaryMat);
  torsoMesh.position.set(0, 1.38, 0);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);

  // 2. Chest Relic Core Ring
  const coreRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.03, 12, 24),
    trimMat,
  );
  coreRing.position.set(0, 1.44, -0.22);
  bodyGroup.add(coreRing);

  const coreGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09, 0),
    visorMat,
  );
  coreGem.position.set(0, 1.44, -0.23);
  bodyGroup.add(coreGem);

  // 3. Pelvis / Hip Chassis
  const pelvisMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.26, 8),
    secondaryMat,
  );
  pelvisMesh.position.set(0, 0.96, 0);
  pelvisMesh.castShadow = true;
  bodyGroup.add(pelvisMesh);

  // 4. Articulated Helmet & Glowing Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.92, 0);
  bodyGroup.add(headGroup);

  const helmetBase = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.12, 8, 16),
    primaryMat,
  );
  helmetBase.castShadow = true;
  headGroup.add(helmetBase);

  // Aero Crest Fin
  const crestGeo = new THREE.BoxGeometry(0.06, 0.22, 0.38);
  const crestMesh = new THREE.Mesh(crestGeo, trimMat);
  crestMesh.position.set(0, 0.14, 0.04);
  crestMesh.rotation.x = -0.25;
  headGroup.add(crestMesh);

  // Curved Visor Optic
  const visorMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.235, 0.235, 0.13, 16, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
    visorMat,
  );
  visorMesh.rotation.y = Math.PI;
  visorMesh.position.set(0, 0.02, 0);
  headGroup.add(visorMesh);

  // 5. Dual Jet-Pack Thruster Unit
  const jetpackBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.5, 0.22),
    secondaryMat,
  );
  jetpackBody.position.set(0, 1.42, 0.26);
  jetpackBody.castShadow = true;
  bodyGroup.add(jetpackBody);

  const nozzleGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.2, 12);
  const leftNozzle = new THREE.Mesh(nozzleGeo, trimMat);
  leftNozzle.position.set(-0.16, 1.15, 0.28);
  leftNozzle.rotation.x = 0.22;
  bodyGroup.add(leftNozzle);

  const rightNozzle = new THREE.Mesh(nozzleGeo, trimMat);
  rightNozzle.position.set(0.16, 1.15, 0.28);
  rightNozzle.rotation.x = 0.22;
  bodyGroup.add(rightNozzle);

  const flameGeo = new THREE.ConeGeometry(0.085, 0.42, 10);
  flameGeo.translate(0, -0.21, 0);
  const leftJetFlame = new THREE.Mesh(flameGeo, jetCoreMat);
  leftJetFlame.position.set(-0.16, 1.06, 0.31);
  leftJetFlame.rotation.x = -0.22;
  bodyGroup.add(leftJetFlame);

  const rightJetFlame = new THREE.Mesh(flameGeo, jetCoreMat);
  rightJetFlame.position.set(0.16, 1.06, 0.31);
  rightJetFlame.rotation.x = -0.22;
  bodyGroup.add(rightJetFlame);

  // 6 & 7. Left & Right Articulated Arms + Pauldrons
  function buildArm(side: -1 | 1): THREE.Group {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 0.48, 1.64, 0);

    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
      primaryMat,
    );
    pauldron.rotation.z = side * -0.35;
    pauldron.position.set(side * 0.03, 0.04, 0);
    pauldron.castShadow = true;
    armGroup.add(pauldron);

    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.26, 6, 10),
      secondaryMat,
    );
    upperArm.position.set(side * 0.04, -0.18, 0);
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.075, 0.32, 10),
      primaryMat,
    );
    forearm.position.set(side * 0.05, -0.44, -0.05);
    forearm.rotation.x = 0.35;
    forearm.castShadow = true;
    armGroup.add(forearm);

    const cuffTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.018, 8, 16),
      visorMat,
    );
    cuffTrim.rotation.x = Math.PI / 2 + 0.35;
    cuffTrim.position.set(side * 0.05, -0.52, -0.08);
    armGroup.add(cuffTrim);

    return armGroup;
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  bodyGroup.add(leftArm);
  bodyGroup.add(rightArm);

  // 8 & 9. Left & Right Articulated Legs + Greaves + Boots
  function buildLeg(side: -1 | 1): THREE.Group {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.2, 0.88, 0);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.115, 0.3, 6, 12),
      secondaryMat,
    );
    thigh.position.set(0, -0.22, 0);
    thigh.castShadow = true;
    legGroup.add(thigh);

    const kneePad = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.18),
      trimMat,
    );
    kneePad.position.set(0, -0.42, -0.06);
    legGroup.add(kneePad);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.085, 0.38, 10),
      primaryMat,
    );
    shin.position.set(0, -0.64, 0.02);
    shin.castShadow = true;
    legGroup.add(shin);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.34),
      primaryMat,
    );
    boot.position.set(0, -0.82, -0.05);
    boot.castShadow = true;
    legGroup.add(boot);

    const soleGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.03, 0.35),
      visorMat,
    );
    soleGlow.position.set(0, -0.87, -0.05);
    legGroup.add(soleGlow);

    return legGroup;
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  bodyGroup.add(leftLeg);
  bodyGroup.add(rightLeg);

  // 10. Soft Contact Shadow Disc on ground
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // 11. Aegis Shield Energy Dome (visible when Shield power-up is active)
  const shieldDome = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.35, 2),
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  shieldDome.position.set(0, 1.15, 0);
  shieldDome.visible = false;
  shieldDome.renderOrder = 10;
  root.add(shieldDome);

  return {
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftJetFlame,
    rightJetFlame,
    shieldDome,
    primaryMat,
    secondaryMat,
    trimMat,
    visorMat,
    jetCoreMat,
  };
}

export function applySuitLoadoutToRig(rig: CyberRunnerRig, loadout: SuitLoadout): void {
  const skin =
    CHASSIS_SKINS.find((s) => s.id === loadout.skinId) || CHASSIS_SKINS[0];
  const visor =
    VISOR_OPTICS.find((v) => v.id === loadout.visorId) || VISOR_OPTICS[0];
  const trail =
    JET_TRAILS.find((t) => t.id === loadout.trailId) || JET_TRAILS[0];

  rig.primaryMat.color.set(skin.primaryColor);
  rig.primaryMat.metalness = skin.metalness;
  rig.primaryMat.roughness = skin.roughness;
  rig.primaryMat.clearcoat = skin.clearcoat;

  rig.secondaryMat.color.set(skin.secondaryColor);
  rig.trimMat.color.set(skin.trimColor);

  rig.visorMat.color.set(visor.glowColor);
  rig.visorMat.emissive.set(visor.glowColor);

  rig.jetCoreMat.color.set(trail.coreColor);
}

export function animateCyberRunnerRig(
  rig: CyberRunnerRig,
  params: {
    mode: 'idle' | 'running';
    time: number;
    speed: number;
    y: number;
    isSliding: boolean;
    isDashing: boolean;
    laneVelocity: number;
    hasShield: boolean;
  },
): void {
  const { mode, time, speed, y, isSliding, isDashing, laneVelocity, hasShield } =
    params;

  rig.shieldDome.visible = hasShield;
  if (hasShield) {
    rig.shieldDome.rotation.y = time * 1.4;
    rig.shieldDome.rotation.z = time * 0.7;
  }

  if (mode === 'idle') {
    // Heroic breathing stance on bridge pedestal
    rig.bodyGroup.position.y = Math.sin(time * 2.4) * 0.035;
    rig.bodyGroup.rotation.x = 0.05;
    rig.bodyGroup.rotation.z = 0;
    rig.leftArm.rotation.x = Math.sin(time * 2.4) * 0.08 - 0.12;
    rig.rightArm.rotation.x = -Math.sin(time * 2.4) * 0.08 + 0.12;
    rig.leftLeg.rotation.x = -0.06;
    rig.rightLeg.rotation.x = 0.08;
    const flamePulse = 0.65 + Math.sin(time * 18) * 0.18;
    rig.leftJetFlame.scale.set(0.8, flamePulse, 0.8);
    rig.rightJetFlame.scale.set(0.8, flamePulse, 0.8);
    return;
  }

  // Active running kinematics
  const runCycle = time * (speed * 0.78);
  const inAir = y > 0.12;

  // Banking into lane switches
  rig.bodyGroup.rotation.z = THREE.MathUtils.clamp(-laneVelocity * 0.065, -0.35, 0.35);

  if (isSliding) {
    // Low aerodynamic power-slide under temple blades
    rig.bodyGroup.position.y = -0.52;
    rig.bodyGroup.rotation.x = -0.85;
    rig.leftLeg.rotation.x = -0.65;
    rig.rightLeg.rotation.x = 0.85;
    rig.leftArm.rotation.x = 0.7;
    rig.rightArm.rotation.x = 0.7;
  } else if (isDashing) {
    // Aggressive forward cyber-dash posture
    rig.bodyGroup.position.y = 0.08;
    rig.bodyGroup.rotation.x = 0.58;
    rig.leftArm.rotation.x = 0.95;
    rig.rightArm.rotation.x = 0.95;
    rig.leftLeg.rotation.x = 0.45;
    rig.rightLeg.rotation.x = -0.35;
  } else if (inAir) {
    // Mid-air thruster leap pose
    rig.bodyGroup.position.y = 0;
    rig.bodyGroup.rotation.x = 0.22;
    rig.leftLeg.rotation.x = 0.55;
    rig.rightLeg.rotation.x = -0.45;
    rig.leftArm.rotation.x = -0.65;
    rig.rightArm.rotation.x = 0.45;
  } else {
    // High-tempo athletic sprint cycle
    rig.bodyGroup.position.y = Math.abs(Math.sin(runCycle)) * 0.11;
    rig.bodyGroup.rotation.x = 0.24;
    const stride = Math.sin(runCycle);
    rig.leftLeg.rotation.x = stride * 0.92;
    rig.rightLeg.rotation.x = -stride * 0.92;
    rig.leftArm.rotation.x = -stride * 0.82;
    rig.rightArm.rotation.x = stride * 0.82;
  }

  // Jet thruster flame scaling
  const thrustBoost = isDashing ? 2.4 : inAir ? 1.65 : 1.05;
  const flicker = thrustBoost * (0.85 + Math.sin(time * 42) * 0.2);
  rig.leftJetFlame.scale.set(isDashing ? 1.35 : 1, flicker, isDashing ? 1.35 : 1);
  rig.rightJetFlame.scale.set(isDashing ? 1.35 : 1, flicker, isDashing ? 1.35 : 1);
}
