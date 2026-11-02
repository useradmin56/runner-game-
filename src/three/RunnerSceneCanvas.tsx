import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BottomDockTab,
  GameScreenState,
  RunTelemetry,
  SuitLoadout,
  TutorialProgressState,
  TutorialStageId,
} from '../types/game';
import {
  animateCyberRunnerRig,
  applySuitLoadoutToRig,
  createCrackedBarrierTexture,
  createCyberRunnerRig,
  createSandstoneTexture,
  createTrackRoadTexture,
} from './proceduralAssets';
import { JET_TRAILS } from '../data/customizationData';
import { soundEngine } from '../audio/soundEngine';

export interface RunnerSceneHandle {
  triggerAction: (action: 'left' | 'right' | 'jump' | 'slide' | 'dash') => void;
  resetAndStartRun: (options?: {
    tutorialMode?: boolean;
    canSkipTutorial?: boolean;
  }) => void;
  skipTutorial: () => void;
}

interface RunnerSceneCanvasProps {
  screenState: GameScreenState;
  activeTab: BottomDockTab;
  loadout: SuitLoadout;
  onTelemetryUpdate: (telemetry: RunTelemetry) => void;
  onRunOver: (finalStats: RunTelemetry) => void;
  onTogglePause: () => void;
  onTutorialCompleted: () => void;
}

type HazardKind = 'hurdle' | 'arch' | 'barrier' | 'gap' | 'speedpad' | 'drone';
type PowerUpKind = 'magnet' | 'shield' | 'multiplier';

interface SpawnedHazard {
  id: number;
  kind: HazardKind;
  lane: -1 | 0 | 1;
  z: number;
  active: boolean;
  shattered: boolean;
  mesh: THREE.Group;
  spinner?: THREE.Object3D;
  laserBeam?: THREE.Mesh;
  baseX: number;
  sweepPhase: number;
  dodgedCounted?: boolean;
}

interface SpawnedCoin {
  id: number;
  lane: -1 | 0 | 1;
  x: number;
  y: number;
  z: number;
  active: boolean;
  mesh: THREE.Mesh;
}

interface SpawnedPowerUp {
  id: number;
  kind: PowerUpKind;
  lane: -1 | 0 | 1;
  x: number;
  y: number;
  z: number;
  active: boolean;
  mesh: THREE.Group;
}

interface ParticleItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

const LANE_WIDTH = 2.5;
const TRACK_CHUNK_LENGTH = 24;
const NUM_TRACK_CHUNKS = 8;

const TUTORIAL_STAGE_META: Record<
  TutorialStageId,
  { stepIndex: number; title: string; instruction: string; target: number }
> = {
  movement: {
    stepIndex: 0,
    title: 'Step 1/4 · Basic Lane Movement',
    instruction:
      'Swipe Left/Right or press A / D (← / →) to switch between the 3 temple lanes.',
    target: 2,
  },
  obstacles: {
    stepIndex: 1,
    title: 'Step 2/4 · Obstacle Avoidance',
    instruction:
      'Swipe Up (W / Space) to Jump over carved hurdles and Swipe Down (S / ↓) to Slide under spinning solar arches.',
    target: 2,
  },
  coins: {
    stepIndex: 2,
    title: 'Step 3/4 · Sun-Coin Collection',
    instruction:
      'Steer through golden Sun-Coin arcs to collect 5 coins for unlocking Cyber-Runner skins.',
    target: 5,
  },
  powerups: {
    stepIndex: 3,
    title: 'Step 4/4 · Power-Ups & Cyber-Dash',
    instruction:
      'Grab a glowing Relic Power-Up (Magnet, Shield, or 2x) or press Shift / Double-Tap to Cyber-Dash through cracked monoliths!',
    target: 1,
  },
  completed: {
    stepIndex: 4,
    title: 'Tutorial Complete!',
    instruction:
      'Systems calibrated! Entering full-speed live temple run — good luck, Strider.',
    target: 1,
  },
};

// Reusable module-scope math objects (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.4, -6);
const _tempColor = new THREE.Color();

export const RunnerSceneCanvas = forwardRef<
  RunnerSceneHandle,
  RunnerSceneCanvasProps
>(
  (
    {
      screenState,
      activeTab,
      loadout,
      onTelemetryUpdate,
      onRunOver,
      onTogglePause,
      onTutorialCompleted,
    },
    ref,
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const screenStateRef = useRef<GameScreenState>(screenState);
    const activeTabRef = useRef<BottomDockTab>(activeTab);
    const loadoutRef = useRef<SuitLoadout>(loadout);
    const onTelemetryRef = useRef(onTelemetryUpdate);
    const onRunOverRef = useRef(onRunOver);
    const onTogglePauseRef = useRef(onTogglePause);
    const onTutorialCompletedRef = useRef(onTutorialCompleted);

    useEffect(() => {
      screenStateRef.current = screenState;
    }, [screenState]);

    useEffect(() => {
      activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
      onTelemetryRef.current = onTelemetryUpdate;
      onRunOverRef.current = onRunOver;
      onTogglePauseRef.current = onTogglePause;
      onTutorialCompletedRef.current = onTutorialCompleted;
    }, [onTelemetryUpdate, onRunOver, onTogglePause, onTutorialCompleted]);

    const actionTriggerRef = useRef<
      ((action: 'left' | 'right' | 'jump' | 'slide' | 'dash') => void) | null
    >(null);
    const resetRunRef = useRef<
      | ((options?: { tutorialMode?: boolean; canSkipTutorial?: boolean }) => void)
      | null
    >(null);
    const skipTutorialRef = useRef<(() => void) | null>(null);
    const updateLoadoutVisualsRef = useRef<((l: SuitLoadout) => void) | null>(
      null,
    );

    useEffect(() => {
      loadoutRef.current = loadout;
      if (updateLoadoutVisualsRef.current) {
        updateLoadoutVisualsRef.current(loadout);
      }
    }, [loadout]);

    useImperativeHandle(ref, () => ({
      triggerAction: (action) => {
        actionTriggerRef.current?.(action);
      },
      resetAndStartRun: (options) => {
        resetRunRef.current?.(options);
      },
      skipTutorial: () => {
        skipTutorialRef.current?.();
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      // 1. Software WebGL detection per Three.js skill standard
      const isSoftwareGl = (() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
      );
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const skyHorizonColor = new THREE.Color(0xdba773);
      scene.background = skyHorizonColor;
      scene.fog = new THREE.FogExp2(0xdba773, 0.0115);

      const camera = new THREE.PerspectiveCamera(
        62,
        container.clientWidth / container.clientHeight,
        0.1,
        220,
      );
      camera.position.set(0, 3.8, 6.5);

      // 2. Studio Environment Map via RoomEnvironment
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(),
        0.04,
      ).texture;
      pmremGenerator.dispose();

      // 3. Balanced 3-Point Warm Sunlit Ruins Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0xfff4d6, 0x7c583b, 1.05);
      hemiLight.position.set(0, 40, 0);
      scene.add(hemiLight);

      const sunKeyLight = new THREE.DirectionalLight(0xffedd5, 2.35);
      sunKeyLight.position.set(22, 36, 18);
      sunKeyLight.castShadow = !isSoftwareGl;
      sunKeyLight.shadow.mapSize.set(1024, 1024);
      sunKeyLight.shadow.camera.near = 5;
      sunKeyLight.shadow.camera.far = 95;
      const d = 22;
      sunKeyLight.shadow.camera.left = -d;
      sunKeyLight.shadow.camera.right = d;
      sunKeyLight.shadow.camera.top = d;
      sunKeyLight.shadow.camera.bottom = -d;
      sunKeyLight.shadow.bias = -0.0005;
      sunKeyLight.shadow.normalBias = 0.02;
      scene.add(sunKeyLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.85);
      rimLight.position.set(-18, 12, -24);
      scene.add(rimLight);

      const sunDisc = new THREE.Mesh(
        new THREE.CircleGeometry(18, 32),
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          fog: false,
        }),
      );
      sunDisc.position.set(0, 28, -165);
      scene.add(sunDisc);

      // 4. Procedural Textures & Materials
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const sandstoneTex = createSandstoneTexture(maxAniso);
      const trackRoadTex = createTrackRoadTexture(maxAniso);
      trackRoadTex.repeat.set(1, 4);
      const crackedBarrierTex = createCrackedBarrierTexture(maxAniso);

      const sandstoneMat = new THREE.MeshStandardMaterial({
        map: sandstoneTex,
        roughness: 0.82,
        metalness: 0.06,
      });

      const trackDeckMat = new THREE.MeshStandardMaterial({
        map: trackRoadTex,
        roughness: 0.72,
        metalness: 0.12,
      });

      const darkStoneMat = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.85,
        metalness: 0.15,
      });

      const goldRelicMat = new THREE.MeshPhysicalMaterial({
        color: 0xfbbf24,
        metalness: 0.92,
        roughness: 0.18,
        clearcoat: 0.8,
      });

      const crackedMonolithMat = new THREE.MeshStandardMaterial({
        map: crackedBarrierTex,
        emissive: 0xd97706,
        emissiveMap: crackedBarrierTex,
        emissiveIntensity: 0.45,
        roughness: 0.65,
        metalness: 0.2,
      });

      const speedPadMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      // 5. Modular Endless Aqueduct Bridge & Natural Canyon Cliff Perimeters
      const trackChunks: {
        group: THREE.Group;
        deckMesh: THREE.Mesh;
        z: number;
      }[] = [];

      function buildAqueductChunk(initialZ: number) {
        const group = new THREE.Group();
        group.position.z = initialZ;

        const deckGeo = new THREE.BoxGeometry(8.8, 1.2, TRACK_CHUNK_LENGTH);
        const deckMesh = new THREE.Mesh(deckGeo, trackDeckMat);
        deckMesh.position.y = -0.6;
        deckMesh.receiveShadow = true;
        group.add(deckMesh);

        const curbGeo = new THREE.BoxGeometry(0.55, 0.42, TRACK_CHUNK_LENGTH);
        [-4.45, 4.45].forEach((xPos) => {
          const curb = new THREE.Mesh(curbGeo, sandstoneMat);
          curb.position.set(xPos, 0.21, 0);
          curb.castShadow = true;
          curb.receiveShadow = true;
          group.add(curb);
        });

        [-5.2, 5.2].forEach((xSide) => {
          const pillarGroup = new THREE.Group();
          pillarGroup.position.set(xSide, 0, 0);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 1.2, 1.3),
            darkStoneMat,
          );
          base.position.y = 0.6;
          pillarGroup.add(base);

          const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.56, 5.2, 8),
            sandstoneMat,
          );
          shaft.position.y = 3.8;
          shaft.castShadow = true;
          pillarGroup.add(shaft);

          const pyramidion = new THREE.Mesh(
            new THREE.ConeGeometry(0.52, 0.9, 4),
            goldRelicMat,
          );
          pyramidion.position.y = 6.85;
          pyramidion.rotation.y = Math.PI / 4;
          pillarGroup.add(pyramidion);

          const underPier = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 18, 2.2),
            sandstoneMat,
          );
          underPier.position.y = -9.5;
          pillarGroup.add(underPier);

          group.add(pillarGroup);
        });

        [-1, 1].forEach((side) => {
          const cliffCluster = new THREE.Group();
          const dist = 16 + Math.random() * 10;
          cliffCluster.position.set(
            side * dist,
            -12,
            (Math.random() - 0.5) * 8,
          );

          const mainCliff = new THREE.Mesh(
            new THREE.DodecahedronGeometry(9 + Math.random() * 4, 1),
            sandstoneMat,
          );
          mainCliff.scale.set(1.2, 2.4, 1.6);
          cliffCluster.add(mainCliff);

          const secondaryRock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(6, 1),
            darkStoneMat,
          );
          secondaryRock.position.set(side * -4, -3, 5);
          secondaryRock.scale.set(1.4, 1.5, 1.2);
          cliffCluster.add(secondaryRock);

          group.add(cliffCluster);
        });

        scene.add(group);
        trackChunks.push({ group, deckMesh, z: initialZ });
      }

      for (let i = 0; i < NUM_TRACK_CHUNKS; i++) {
        buildAqueductChunk(12 - i * TRACK_CHUNK_LENGTH);
      }

      const canyonFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({
          color: 0xb48456,
          roughness: 0.95,
          metalness: 0.0,
        }),
      );
      canyonFloor.rotation.x = -Math.PI / 2;
      canyonFloor.position.y = -18;
      scene.add(canyonFloor);

      // 6. Hero 12-Part Articulated Cyber-Runner Suit
      const runnerRig = createCyberRunnerRig();
      applySuitLoadoutToRig(runnerRig, loadoutRef.current);
      scene.add(runnerRig.root);

      updateLoadoutVisualsRef.current = (newLoadout: SuitLoadout) => {
        applySuitLoadoutToRig(runnerRig, newLoadout);
      };

      // 7. Pooled Particle System
      const MAX_PARTICLES = 180;
      const particleGeo = new THREE.OctahedronGeometry(0.14, 0);
      const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const particleMesh = new THREE.InstancedMesh(
        particleGeo,
        particleMat,
        MAX_PARTICLES,
      );
      particleMesh.frustumCulled = false;
      particleMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(MAX_PARTICLES * 3),
        3,
      );
      scene.add(particleMesh);

      const particles: ParticleItem[] = Array.from(
        { length: MAX_PARTICLES },
        () => ({
          active: false,
          pos: new THREE.Vector3(),
          vel: new THREE.Vector3(),
          scale: 1,
          life: 0,
          maxLife: 0.5,
          color: new THREE.Color(0xfef08a),
        }),
      );

      function spawnParticleBurst(
        origin: THREE.Vector3,
        count: number,
        hexColor: string | number,
        speedSpread: number,
        baseScale = 1,
      ) {
        let spawned = 0;
        for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
          const p = particles[i];
          if (!p.active) {
            p.active = true;
            p.pos.copy(origin);
            p.vel.set(
              (Math.random() - 0.5) * speedSpread,
              Math.random() * speedSpread * 0.85 + 1.2,
              (Math.random() - 0.5) * speedSpread,
            );
            p.scale = baseScale * (0.65 + Math.random() * 0.7);
            p.life = 0;
            p.maxLife = 0.28 + Math.random() * 0.32;
            p.color.set(hexColor);
            spawned++;
          }
        }
      }

      // 8. Hazard, Coin & Power-Up Builders
      const hazards: SpawnedHazard[] = [];
      const coins: SpawnedCoin[] = [];
      const powerUps: SpawnedPowerUp[] = [];
      let entityIdCounter = 1;

      function createHazardGroup(kind: HazardKind): {
        group: THREE.Group;
        spinner?: THREE.Object3D;
        laserBeam?: THREE.Mesh;
      } {
        const group = new THREE.Group();

        if (kind === 'hurdle') {
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(2.15, 0.75, 0.45),
            sandstoneMat,
          );
          beam.position.y = 0.52;
          beam.castShadow = true;
          beam.receiveShadow = true;
          group.add(beam);

          const topStrip = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.14, 0.5),
            goldRelicMat,
          );
          topStrip.position.y = 0.92;
          group.add(topStrip);

          [-0.95, 0.95].forEach((x) => {
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(0.28, 1.05, 0.56),
              darkStoneMat,
            );
            post.position.set(x, 0.525, 0);
            post.castShadow = true;
            group.add(post);
          });
          return { group };
        }

        if (kind === 'arch') {
          [-1.02, 1.02].forEach((x) => {
            const column = new THREE.Mesh(
              new THREE.BoxGeometry(0.32, 3.2, 0.55),
              darkStoneMat,
            );
            column.position.set(x, 1.6, 0);
            column.castShadow = true;
            group.add(column);
          });

          const headerBlock = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.35, 0.62),
            sandstoneMat,
          );
          headerBlock.position.y = 2.15;
          headerBlock.castShadow = true;
          group.add(headerBlock);

          const spinner = new THREE.Group();
          spinner.position.set(0, 1.55, 0);
          const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.68, 0.68, 0.08, 16),
            goldRelicMat,
          );
          disc.rotation.z = Math.PI / 2;
          spinner.add(disc);

          const glowRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.68, 0.04, 8, 20),
            new THREE.MeshBasicMaterial({ color: 0xef4444 }),
          );
          glowRing.rotation.y = Math.PI / 2;
          spinner.add(glowRing);

          group.add(spinner);
          return { group, spinner };
        }

        if (kind === 'barrier') {
          const slab = new THREE.Mesh(
            new THREE.BoxGeometry(2.05, 2.55, 0.65),
            crackedMonolithMat,
          );
          slab.position.y = 1.28;
          slab.castShadow = true;
          slab.receiveShadow = true;
          group.add(slab);

          const cap = new THREE.Mesh(
            new THREE.ConeGeometry(1.25, 0.65, 4),
            goldRelicMat,
          );
          cap.position.y = 2.85;
          cap.rotation.y = Math.PI / 4;
          group.add(cap);
          return { group };
        }

        if (kind === 'gap') {
          const pit = new THREE.Mesh(
            new THREE.PlaneGeometry(2.35, 3.6),
            new THREE.MeshBasicMaterial({
              color: 0x0d0907,
              polygonOffset: true,
              polygonOffsetFactor: -3,
              polygonOffsetUnits: -3,
            }),
          );
          pit.rotation.x = -Math.PI / 2;
          pit.position.y = 0.025;
          group.add(pit);

          [-1.75, 1.75].forEach((zEdge) => {
            const rim = new THREE.Mesh(
              new THREE.BoxGeometry(2.35, 0.12, 0.18),
              new THREE.MeshBasicMaterial({ color: 0xef4444 }),
            );
            rim.position.set(0, 0.06, zEdge);
            group.add(rim);
          });
          return { group };
        }

        if (kind === 'speedpad') {
          const pad = new THREE.Mesh(
            new THREE.PlaneGeometry(2.0, 4.2),
            speedPadMat,
          );
          pad.rotation.x = -Math.PI / 2;
          pad.position.y = 0.03;
          group.add(pad);
          return { group };
        }

        const droneBody = new THREE.Group();
        droneBody.position.y = 1.45;

        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.52, 1),
          darkStoneMat,
        );
        core.castShadow = true;
        droneBody.add(core);

        const gyroRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.74, 0.065, 8, 24),
          goldRelicMat,
        );
        gyroRing.rotation.x = Math.PI / 2;
        droneBody.add(gyroRing);

        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xef4444 }),
        );
        eye.position.z = 0.42;
        droneBody.add(eye);

        const laserGeo = new THREE.CylinderGeometry(0.04, 0.04, 10, 8);
        laserGeo.rotateX(Math.PI / 2);
        laserGeo.translate(0, 0, 5);
        const laserBeam = new THREE.Mesh(
          laserGeo,
          new THREE.MeshBasicMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.55,
          }),
        );
        droneBody.add(laserBeam);

        group.add(droneBody);
        return { group, spinner: gyroRing, laserBeam };
      }

      const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
      coinGeo.rotateX(Math.PI / 2);

      function spawnCoin(lane: -1 | 0 | 1, y: number, z: number) {
        const mesh = new THREE.Mesh(coinGeo, goldRelicMat);
        const x = lane * LANE_WIDTH;
        mesh.position.set(x, y, z);
        scene.add(mesh);
        coins.push({
          id: entityIdCounter++,
          lane,
          x,
          y,
          z,
          active: true,
          mesh,
        });
      }

      function spawnPowerUp(kind: PowerUpKind, lane: -1 | 0 | 1, z: number) {
        const group = new THREE.Group();
        const x = lane * LANE_WIDTH;
        const y = 1.35;
        group.position.set(x, y, z);

        const colorHex =
          kind === 'magnet'
            ? 0xf59e0b
            : kind === 'shield'
              ? 0x06b6d4
              : 0xa855f7;

        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.48, 0),
          new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.85,
            roughness: 0.15,
            metalness: 0.5,
          }),
        );
        group.add(crystal);

        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.68, 0.045, 8, 24),
          new THREE.MeshBasicMaterial({ color: colorHex }),
        );
        group.add(halo);

        scene.add(group);
        powerUps.push({
          id: entityIdCounter++,
          kind,
          lane,
          x,
          y,
          z,
          active: true,
          mesh: group,
        });
      }

      function spawnHazard(kind: HazardKind, lane: -1 | 0 | 1, z: number) {
        const { group, spinner, laserBeam } = createHazardGroup(kind);
        const baseX = lane * LANE_WIDTH;
        group.position.set(baseX, 0, z);
        scene.add(group);
        hazards.push({
          id: entityIdCounter++,
          kind,
          lane,
          z,
          active: true,
          shattered: false,
          mesh: group,
          spinner,
          laserBeam,
          baseX,
          sweepPhase: Math.random() * Math.PI * 2,
        });
      }

      // 9. Mutable Simulation + Tutorial State
      const sim = {
        lane: 0 as -1 | 0 | 1,
        x: 0,
        y: 0,
        vy: 0,
        isJumping: false,
        coyoteTimer: 0,
        isSliding: false,
        slideTimer: 0,
        isDashing: false,
        dashTimer: 0,
        dashCooldown: 0,
        speed: 20,
        baseSpeed: 20,
        speedBoostTimer: 0,
        distance: 0,
        score: 0,
        coins: 0,
        barriersShattered: 0,
        powerUpsPicked: 0,
        dronesDodged: 0,
        magnetTimer: 0,
        hasShield: false,
        multiplierTimer: 0,
        hitstopTimer: 0,
        cameraShake: 0,
        turntableAngle: 0,
        bufferedAction: null as
          | 'left'
          | 'right'
          | 'jump'
          | 'slide'
          | 'dash'
          | null,
        bufferExpiry: 0,
        // Tutorial state
        tutorialActive: false,
        tutorialStage: 'movement' as TutorialStageId,
        tutorialProgress: 0,
        tutorialCanSkip: true,
        tutorialCompleteBannerTimer: 0,
      };

      let nextSpawnZ = -32;
      let tutorialObstacleAlternate = false;

      function advanceTutorialStage(nextStage: TutorialStageId) {
        soundEngine.playTutorialStepSuccess();
        sim.tutorialStage = nextStage;
        sim.tutorialProgress = 0;

        // Clear far entities and spawn tailored tutorial wave right ahead
        for (let i = hazards.length - 1; i >= 0; i--) {
          if (hazards[i].z < -12) {
            scene.remove(hazards[i].mesh);
            hazards.splice(i, 1);
          }
        }
        for (let i = coins.length - 1; i >= 0; i--) {
          if (coins[i].z < -12) {
            scene.remove(coins[i].mesh);
            coins.splice(i, 1);
          }
        }
        for (let i = powerUps.length - 1; i >= 0; i--) {
          if (powerUps[i].z < -12) {
            scene.remove(powerUps[i].mesh);
            powerUps.splice(i, 1);
          }
        }

        nextSpawnZ = -26;
        if (nextStage === 'completed') {
          sim.tutorialCompleteBannerTimer = 2.8;
          sim.coins += 50; // Tutorial completion bonus
          sim.score += 500;
          onTutorialCompletedRef.current();
          setTimeout(() => {
            sim.tutorialActive = false;
          }, 2600);
        }
      }

      function spawnTutorialRow(z: number) {
        const lanes: (-1 | 0 | 1)[] = [-1, 0, 1];
        if (sim.tutorialStage === 'movement') {
          // Gentle guiding coins on left and right lanes to invite lane switching
          const sideLane: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
          spawnCoin(sideLane, 1.1, z);
          return;
        }

        if (sim.tutorialStage === 'obstacles') {
          // Alternate between jumpable hurdle and slideable arch across all 3 lanes so player practices both
          const kind: HazardKind = tutorialObstacleAlternate ? 'arch' : 'hurdle';
          tutorialObstacleAlternate = !tutorialObstacleAlternate;
          lanes.forEach((l) => spawnHazard(kind, l, z));
          return;
        }

        if (sim.tutorialStage === 'coins') {
          // Rich Sun-Coin ribbons across all lanes
          lanes.forEach((l) => {
            for (let c = 0; c < 3; c++) {
              spawnCoin(l, 1.1, z - c * 2.2);
            }
          });
          return;
        }

        if (sim.tutorialStage === 'powerups') {
          // Spawn initial Power-Ups in lanes -1, 0, 1 followed by cracked barriers to Dash through
          spawnPowerUp('magnet', -1, z);
          spawnPowerUp('shield', 0, z);
          spawnPowerUp('multiplier', 1, z);
          lanes.forEach((l) => spawnHazard('barrier', l, z - 9));
          return;
        }
      }

      function spawnProceduralRow(z: number, distanceProgress: number) {
        if (sim.tutorialActive && sim.tutorialStage !== 'completed') {
          spawnTutorialRow(z);
          return;
        }

        const lanes: (-1 | 0 | 1)[] = [-1, 0, 1];
        const primaryLane = lanes[Math.floor(Math.random() * 3)];

        const difficulty = Math.min(1, distanceProgress / 1600);
        const roll = Math.random();

        if (roll < 0.16) {
          spawnHazard('drone', primaryLane, z);
          const coinLane = (((primaryLane + 2) % 3) - 1) as -1 | 0 | 1;
          for (let c = 0; c < 4; c++) {
            spawnCoin(coinLane, 1.1, z + c * 2.2);
          }
          return;
        }

        for (const lane of lanes) {
          if (lane === primaryLane) {
            const subRoll = Math.random();
            if (subRoll < 0.35) {
              spawnHazard('hurdle', lane, z);
              for (let i = -2; i <= 2; i++) {
                const arcY = 1.15 + Math.cos((i / 2) * (Math.PI / 2)) * 1.35;
                spawnCoin(lane, arcY, z + i * 1.6);
              }
            } else if (subRoll < 0.55) {
              spawnHazard('arch', lane, z);
              for (let i = -1; i <= 1; i++) {
                spawnCoin(lane, 0.65, z + i * 1.8);
              }
            } else if (subRoll < 0.72) {
              spawnHazard('speedpad', lane, z);
              for (let i = 0; i < 4; i++) {
                spawnCoin(lane, 1.1, z - i * 1.8);
              }
            } else {
              if (Math.random() < 0.24) {
                const kinds: PowerUpKind[] = ['magnet', 'shield', 'multiplier'];
                const chosenKind =
                  kinds[Math.floor(Math.random() * kinds.length)];
                spawnPowerUp(chosenKind, lane, z);
              } else {
                for (let i = 0; i < 4; i++) {
                  spawnCoin(lane, 1.1, z - i * 1.9);
                }
              }
            }
          } else {
            if (Math.random() < 0.65 + difficulty * 0.22) {
              const obsRoll = Math.random();
              if (obsRoll < 0.32) {
                spawnHazard('barrier', lane, z);
              } else if (obsRoll < 0.58) {
                spawnHazard('hurdle', lane, z);
              } else if (obsRoll < 0.82) {
                spawnHazard('arch', lane, z);
              } else {
                spawnHazard('gap', lane, z);
              }
            } else if (Math.random() < 0.35) {
              spawnCoin(lane, 1.1, z);
            }
          }
        }
      }

      function clearWorldEntities() {
        hazards.forEach((h) => scene.remove(h.mesh));
        hazards.length = 0;
        coins.forEach((c) => scene.remove(c.mesh));
        coins.length = 0;
        powerUps.forEach((p) => scene.remove(p.mesh));
        powerUps.length = 0;
      }

      function resetRun(options?: {
        tutorialMode?: boolean;
        canSkipTutorial?: boolean;
      }) {
        clearWorldEntities();
        sim.lane = 0;
        sim.x = 0;
        sim.y = 0;
        sim.vy = 0;
        sim.isJumping = false;
        sim.coyoteTimer = 0;
        sim.isSliding = false;
        sim.slideTimer = 0;
        sim.isDashing = false;
        sim.dashTimer = 0;
        sim.dashCooldown = 0;
        sim.baseSpeed = options?.tutorialMode ? 17.5 : 21;
        sim.speed = sim.baseSpeed;
        sim.speedBoostTimer = 0;
        sim.distance = 0;
        sim.score = 0;
        sim.coins = 0;
        sim.barriersShattered = 0;
        sim.powerUpsPicked = 0;
        sim.dronesDodged = 0;
        sim.magnetTimer = 0;
        sim.hasShield = false;
        sim.multiplierTimer = 0;
        sim.hitstopTimer = 0;
        sim.cameraShake = 0;
        sim.bufferedAction = null;

        sim.tutorialActive = Boolean(options?.tutorialMode);
        sim.tutorialStage = 'movement';
        sim.tutorialProgress = 0;
        sim.tutorialCanSkip = options?.canSkipTutorial ?? true;
        sim.tutorialCompleteBannerTimer = 0;
        tutorialObstacleAlternate = false;

        runnerRig.root.position.set(0, 0, 0);
        runnerRig.root.rotation.set(0, 0, 0);

        nextSpawnZ = -26;
        const initialRows = sim.tutorialActive ? 5 : 9;
        for (let i = 0; i < initialRows; i++) {
          spawnProceduralRow(nextSpawnZ, 0);
          nextSpawnZ -= 16;
        }
      }

      resetRunRef.current = resetRun;

      skipTutorialRef.current = () => {
        if (!sim.tutorialActive) return;
        sim.tutorialActive = false;
        soundEngine.playTutorialStepSuccess();
        onTutorialCompletedRef.current();
      };

      // 11. Action Execution & Input Buffer
      function executeAction(
        action: 'left' | 'right' | 'jump' | 'slide' | 'dash',
        nowMs: number,
      ) {
        if (screenStateRef.current !== 'playing') return;

        if (action === 'left') {
          if (sim.lane > -1) {
            sim.lane = (sim.lane - 1) as -1 | 0 | 1;
            soundEngine.playLaneSwitch();
            if (sim.tutorialActive && sim.tutorialStage === 'movement') {
              sim.tutorialProgress += 1;
              if (
                sim.tutorialProgress >= TUTORIAL_STAGE_META.movement.target
              ) {
                advanceTutorialStage('obstacles');
              }
            }
          }
          return;
        }

        if (action === 'right') {
          if (sim.lane < 1) {
            sim.lane = (sim.lane + 1) as -1 | 0 | 1;
            soundEngine.playLaneSwitch();
            if (sim.tutorialActive && sim.tutorialStage === 'movement') {
              sim.tutorialProgress += 1;
              if (
                sim.tutorialProgress >= TUTORIAL_STAGE_META.movement.target
              ) {
                advanceTutorialStage('obstacles');
              }
            }
          }
          return;
        }

        if (action === 'jump') {
          if (sim.y <= 0.08 || sim.coyoteTimer > 0) {
            sim.vy = 13.8;
            sim.isJumping = true;
            sim.coyoteTimer = 0;
            sim.isSliding = false;
            sim.slideTimer = 0;
            soundEngine.playJump();
            spawnParticleBurst(
              new THREE.Vector3(sim.x, 0.2, 0),
              10,
              0xfef08a,
              4.5,
              0.9,
            );
            if (sim.tutorialActive && sim.tutorialStage === 'obstacles') {
              sim.tutorialProgress += 1;
              if (
                sim.tutorialProgress >= TUTORIAL_STAGE_META.obstacles.target
              ) {
                advanceTutorialStage('coins');
              }
            }
          } else {
            sim.bufferedAction = 'jump';
            sim.bufferExpiry = nowMs + 140;
          }
          return;
        }

        if (action === 'slide') {
          if (sim.y > 0.15) {
            sim.vy = -24;
            sim.bufferedAction = 'slide';
            sim.bufferExpiry = nowMs + 260;
          } else {
            sim.isSliding = true;
            sim.slideTimer = 0.68;
            soundEngine.playSlide();
            if (sim.tutorialActive && sim.tutorialStage === 'obstacles') {
              sim.tutorialProgress += 1;
              if (
                sim.tutorialProgress >= TUTORIAL_STAGE_META.obstacles.target
              ) {
                advanceTutorialStage('coins');
              }
            }
          }
          return;
        }

        if (action === 'dash') {
          if (sim.dashCooldown <= 0 && !sim.isDashing) {
            sim.isDashing = true;
            sim.dashTimer = 0.48;
            sim.dashCooldown = 3.2;
            sim.cameraShake = 0.22;
            soundEngine.playDash();
            spawnParticleBurst(
              new THREE.Vector3(sim.x, sim.y + 1.1, 0),
              18,
              0x38bdf8,
              7.5,
              1.1,
            );
            if (sim.tutorialActive && sim.tutorialStage === 'powerups') {
              sim.tutorialProgress += 1;
              if (
                sim.tutorialProgress >= TUTORIAL_STAGE_META.powerups.target
              ) {
                advanceTutorialStage('completed');
              }
            }
          }
        }
      }

      actionTriggerRef.current = (action) =>
        executeAction(action, performance.now());

      const onKeyDown = (e: KeyboardEvent) => {
        if (
          document.activeElement &&
          ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
        ) {
          return;
        }

        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (
            screenStateRef.current === 'playing' ||
            screenStateRef.current === 'paused'
          ) {
            e.preventDefault();
            onTogglePauseRef.current();
          }
          return;
        }

        if (screenStateRef.current !== 'playing') return;

        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            e.preventDefault();
            executeAction('left', performance.now());
            break;
          case 'ArrowRight':
          case 'KeyD':
            e.preventDefault();
            executeAction('right', performance.now());
            break;
          case 'ArrowUp':
          case 'KeyW':
          case 'Space':
            e.preventDefault();
            executeAction('jump', performance.now());
            break;
          case 'ArrowDown':
          case 'KeyS':
            e.preventDefault();
            executeAction('slide', performance.now());
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
          case 'KeyE':
          case 'KeyF':
            e.preventDefault();
            executeAction('dash', performance.now());
            break;
        }
      };

      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let swipeConsumed = false;
      let lastTapTime = 0;
      let isDraggingTurntable = false;
      let prevDragX = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (
          screenStateRef.current === 'title' &&
          activeTabRef.current === 'customize'
        ) {
          isDraggingTurntable = true;
          prevDragX = e.clientX;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (isDraggingTurntable) {
          const dx = e.clientX - prevDragX;
          prevDragX = e.clientX;
          sim.turntableAngle += dx * 0.012;
        }
      };

      const onPointerUp = () => {
        isDraggingTurntable = false;
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 0) return;
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = performance.now();
        swipeConsumed = false;
      };

      const onTouchMove = (e: TouchEvent) => {
        if (screenStateRef.current !== 'playing' || swipeConsumed) return;
        if (e.touches.length === 0) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) > 28) {
          swipeConsumed = true;
          if (absX > absY) {
            executeAction(dx > 0 ? 'right' : 'left', performance.now());
          } else {
            executeAction(dy > 0 ? 'slide' : 'jump', performance.now());
          }
        }
      };

      const onTouchEnd = () => {
        if (screenStateRef.current !== 'playing') return;
        const now = performance.now();
        if (!swipeConsumed && now - touchStartTime < 220) {
          if (now - lastTapTime < 280) {
            executeAction('dash', now);
            lastTapTime = 0;
          } else {
            lastTapTime = now;
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);
      const domElem = renderer.domElement;
      domElem.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      domElem.addEventListener('touchstart', onTouchStart, { passive: true });
      domElem.addEventListener('touchmove', onTouchMove, { passive: true });
      domElem.addEventListener('touchend', onTouchEnd, { passive: true });

      const onResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      let frameId = 0;
      let lastTime = performance.now();
      let elapsedTotal = 0;
      let lastHudSync = 0;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function getTutorialTelemetry(): TutorialProgressState | undefined {
        if (!sim.tutorialActive) return undefined;
        const meta = TUTORIAL_STAGE_META[sim.tutorialStage];
        return {
          active: true,
          stage: sim.tutorialStage,
          stepIndex: meta.stepIndex,
          title: meta.title,
          instruction: meta.instruction,
          progressCurrent: Math.min(sim.tutorialProgress, meta.target),
          progressTarget: meta.target,
          canSkip: sim.tutorialCanSkip,
        };
      }

      function emitTelemetry(causeOfDefeat?: string) {
        const mult = sim.multiplierTimer > 0 ? 2 : 1;
        const speedKmh = Math.round(sim.speed * 3.6);
        soundEngine.setMusicDynamics(
          speedKmh,
          screenStateRef.current === 'playing',
        );
        onTelemetryRef.current({
          score: Math.floor(sim.score),
          distance: Math.floor(sim.distance),
          coins: sim.coins,
          speed: speedKmh,
          multiplierValue: mult,
          dashCooldownRatio: Math.max(0, Math.min(1, sim.dashCooldown / 3.2)),
          isDashing: sim.isDashing,
          powerUps: {
            magnet: Math.max(0, sim.magnetTimer),
            shield: sim.hasShield,
            multiplier: Math.max(0, sim.multiplierTimer),
          },
          barriersShattered: sim.barriersShattered,
          powerUpsPicked: sim.powerUpsPicked,
          dronesDodged: sim.dronesDodged,
          currentRank: null,
          tutorial: getTutorialTelemetry(),
          causeOfDefeat,
        });
      }

      function handleCollisionImpact(
        hazard: SpawnedHazard,
        description: string,
      ) {
        if (sim.isDashing && hazard.kind === 'barrier') {
          hazard.active = false;
          hazard.shattered = true;
          hazard.mesh.visible = false;
          sim.barriersShattered += 1;
          sim.score += 250 * (sim.multiplierTimer > 0 ? 2 : 1);
          sim.hitstopTimer = 0.045;
          sim.cameraShake = 0.45;
          soundEngine.playBarrierShatter();
          spawnParticleBurst(
            new THREE.Vector3(hazard.baseX, 1.3, 0),
            28,
            0xf59e0b,
            9.5,
            1.35,
          );
          if (sim.tutorialActive && sim.tutorialStage === 'powerups') {
            sim.tutorialProgress += 1;
            if (
              sim.tutorialProgress >= TUTORIAL_STAGE_META.powerups.target
            ) {
              advanceTutorialStage('completed');
            }
          }
          return;
        }

        // In Tutorial mode, protect the player from dying so they can practice freely!
        if (sim.tutorialActive) {
          hazard.active = false;
          hazard.mesh.visible = false;
          sim.hitstopTimer = 0.04;
          sim.cameraShake = 0.35;
          soundEngine.playObstacleHit();
          spawnParticleBurst(
            new THREE.Vector3(sim.x, sim.y + 1.1, 0),
            22,
            0xf59e0b,
            8,
            1.1,
          );
          return;
        }

        if (sim.hasShield) {
          sim.hasShield = false;
          hazard.active = false;
          hazard.mesh.visible = false;
          sim.hitstopTimer = 0.055;
          sim.cameraShake = 0.5;
          soundEngine.playShieldBreak();
          spawnParticleBurst(
            new THREE.Vector3(sim.x, sim.y + 1.1, 0),
            32,
            0x06b6d4,
            10,
            1.3,
          );
          return;
        }

        // Fatal collision -> Game Over
        sim.cameraShake = 0.65;
        soundEngine.playGameOver();
        spawnParticleBurst(
          new THREE.Vector3(sim.x, sim.y + 1.0, 0),
          35,
          0xef4444,
          9,
          1.25,
        );
        const mult = sim.multiplierTimer > 0 ? 2 : 1;
        onRunOverRef.current({
          score: Math.floor(sim.score),
          distance: Math.floor(sim.distance),
          coins: sim.coins,
          speed: Math.round(sim.speed * 3.6),
          multiplierValue: mult,
          dashCooldownRatio: 0,
          isDashing: false,
          powerUps: {
            magnet: 0,
            shield: false,
            multiplier: 0,
          },
          barriersShattered: sim.barriersShattered,
          powerUpsPicked: sim.powerUpsPicked,
          dronesDodged: sim.dronesDodged,
          currentRank: null,
          causeOfDefeat: description,
        });
      }

      function tick() {
        const now = performance.now();
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Math.min(rawDt, 0.05);
        elapsedTotal += dt;

        const currentScreen = screenStateRef.current;

        if (currentScreen === 'title') {
          runnerRig.root.position.set(0, 0, 0);
          if (!isDraggingTurntable) {
            sim.turntableAngle += dt * 0.45;
          }

          if (activeTabRef.current === 'customize') {
            runnerRig.root.rotation.y = THREE.MathUtils.damp(
              runnerRig.root.rotation.y,
              Math.PI + sim.turntableAngle,
              6,
              dt,
            );
            _camTargetPos.set(0, 1.65, 3.35);
            _camLookTarget.set(0, 1.32, 0);
          } else {
            runnerRig.root.rotation.y = THREE.MathUtils.damp(
              runnerRig.root.rotation.y,
              Math.PI * 0.82 + Math.sin(elapsedTotal * 0.5) * 0.15,
              4,
              dt,
            );
            _camTargetPos.set(
              Math.sin(elapsedTotal * 0.28) * 2.2,
              2.65,
              5.2,
            );
            _camLookTarget.set(0, 1.45, -4);
          }

          camera.position.lerp(_camTargetPos, 1 - Math.exp(-5 * dt));
          _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-6 * dt));
          camera.lookAt(_currentLookAt);

          animateCyberRunnerRig(runnerRig, {
            mode: 'idle',
            time: elapsedTotal,
            speed: 0,
            y: 0,
            isSliding: false,
            isDashing: false,
            laneVelocity: 0,
            hasShield: false,
          });
        } else if (currentScreen === 'playing') {
          if (sim.hitstopTimer > 0) {
            sim.hitstopTimer -= dt;
          } else {
            if (
              sim.bufferedAction &&
              now <= sim.bufferExpiry &&
              sim.y <= 0.08
            ) {
              const buffered = sim.bufferedAction;
              sim.bufferedAction = null;
              executeAction(buffered, now);
            }

            // Speed progression & timers
            sim.baseSpeed = sim.tutorialActive
              ? 18
              : Math.min(38, 21 + sim.distance * 0.0085);
            if (sim.speedBoostTimer > 0) {
              sim.speedBoostTimer -= dt;
            }
            if (sim.isDashing) {
              sim.dashTimer -= dt;
              if (sim.dashTimer <= 0) {
                sim.isDashing = false;
              }
            }
            if (sim.dashCooldown > 0) {
              sim.dashCooldown = Math.max(0, sim.dashCooldown - dt);
            }
            if (sim.magnetTimer > 0) {
              sim.magnetTimer = Math.max(0, sim.magnetTimer - dt);
            }
            if (sim.multiplierTimer > 0) {
              sim.multiplierTimer = Math.max(0, sim.multiplierTimer - dt);
            }

            const targetSpeed = sim.isDashing
              ? sim.baseSpeed * 1.65
              : sim.speedBoostTimer > 0
                ? sim.baseSpeed * 1.38
                : sim.baseSpeed;
            sim.speed = THREE.MathUtils.damp(sim.speed, targetSpeed, 8, dt);

            const stepZ = sim.speed * dt;
            sim.distance += stepZ * 0.45;
            const mult = sim.multiplierTimer > 0 ? 2 : 1;
            sim.score += stepZ * 1.8 * mult;

            const targetX = sim.lane * LANE_WIDTH;
            const prevX = sim.x;
            sim.x = THREE.MathUtils.damp(sim.x, targetX, 14, dt);
            const laneVelocity = (sim.x - prevX) / Math.max(dt, 0.001);

            if (sim.isSliding) {
              sim.slideTimer -= dt;
              if (sim.slideTimer <= 0) {
                sim.isSliding = false;
              }
            }

            if (sim.y > 0 || sim.vy !== 0) {
              sim.y += sim.vy * dt;
              sim.vy -= 36 * dt;
              if (sim.y <= 0) {
                sim.y = 0;
                sim.vy = 0;
                sim.isJumping = false;
                sim.coyoteTimer = 0.09;
              }
            } else {
              sim.coyoteTimer = 0.09;
            }

            runnerRig.root.position.set(sim.x, sim.y, 0);
            runnerRig.root.rotation.set(0, 0, 0);

            animateCyberRunnerRig(runnerRig, {
              mode: 'running',
              time: elapsedTotal,
              speed: sim.speed,
              y: sim.y,
              isSliding: sim.isSliding,
              isDashing: sim.isDashing,
              laneVelocity,
              hasShield: sim.hasShield,
            });

            if (Math.random() < 0.75) {
              const trailDef =
                JET_TRAILS.find((t) => t.id === loadoutRef.current.trailId) ||
                JET_TRAILS[0];
              spawnParticleBurst(
                new THREE.Vector3(
                  sim.x + (Math.random() - 0.5) * 0.35,
                  sim.y + (sim.isSliding ? 0.55 : 1.05),
                  0.45,
                ),
                1,
                Math.random() < 0.5
                  ? trailDef.coreColor
                  : trailDef.outerColor,
                1.8,
                sim.isDashing ? 1.15 : 0.7,
              );
            }

            trackRoadTex.offset.y -= stepZ * 0.04;
            for (const chunk of trackChunks) {
              chunk.z += stepZ;
              if (chunk.z > TRACK_CHUNK_LENGTH * 1.5) {
                chunk.z -= TRACK_CHUNK_LENGTH * NUM_TRACK_CHUNKS;
              }
              chunk.group.position.z = chunk.z;
            }

            nextSpawnZ += stepZ;
            while (nextSpawnZ > -145) {
              spawnProceduralRow(nextSpawnZ, sim.distance);
              nextSpawnZ -= 16.5;
            }

            // Update & Check Coins
            for (let i = coins.length - 1; i >= 0; i--) {
              const c = coins[i];
              c.z += stepZ;

              if (c.active) {
                if (sim.magnetTimer > 0 && c.z > -18 && c.z < 3) {
                  c.x = THREE.MathUtils.damp(c.x, sim.x, 11, dt);
                  c.y = THREE.MathUtils.damp(c.y, sim.y + 1.1, 11, dt);
                }

                c.mesh.position.set(
                  c.x,
                  c.y + Math.sin(elapsedTotal * 5 + c.id) * 0.08,
                  c.z,
                );
                c.mesh.rotation.y += dt * 3.2;

                const dx = Math.abs(c.x - sim.x);
                const dy = Math.abs(c.y - (sim.y + 1.0));
                const dz = Math.abs(c.z);

                if (dx < 0.95 && dy < 1.25 && dz < 1.05) {
                  c.active = false;
                  c.mesh.visible = false;
                  const coinGain = sim.multiplierTimer > 0 ? 2 : 1;
                  sim.coins += coinGain;
                  sim.score += 25 * coinGain;
                  soundEngine.playCoinPickup();
                  spawnParticleBurst(
                    new THREE.Vector3(c.x, c.y, c.z),
                    8,
                    0xfbbf24,
                    4.5,
                    0.85,
                  );

                  if (sim.tutorialActive && sim.tutorialStage === 'coins') {
                    sim.tutorialProgress += 1;
                    if (
                      sim.tutorialProgress >= TUTORIAL_STAGE_META.coins.target
                    ) {
                      advanceTutorialStage('powerups');
                    }
                  }
                }
              }

              if (c.z > 12) {
                scene.remove(c.mesh);
                coins.splice(i, 1);
              }
            }

            // Update & Check Power-Ups
            for (let i = powerUps.length - 1; i >= 0; i--) {
              const p = powerUps[i];
              p.z += stepZ;
              if (p.active) {
                p.mesh.position.set(
                  p.x,
                  p.y + Math.sin(elapsedTotal * 4 + p.id) * 0.12,
                  p.z,
                );
                p.mesh.rotation.y += dt * 2.5;
                p.mesh.rotation.z += dt * 1.2;

                if (
                  Math.abs(p.x - sim.x) < 1.05 &&
                  Math.abs(p.z) < 1.15 &&
                  Math.abs(p.y - (sim.y + 1.0)) < 1.35
                ) {
                  p.active = false;
                  p.mesh.visible = false;
                  sim.powerUpsPicked += 1;
                  soundEngine.playPowerUp();
                  if (p.kind === 'magnet') sim.magnetTimer = 10;
                  if (p.kind === 'shield') sim.hasShield = true;
                  if (p.kind === 'multiplier') sim.multiplierTimer = 10;
                  spawnParticleBurst(
                    new THREE.Vector3(p.x, p.y, 0),
                    20,
                    p.kind === 'magnet'
                      ? 0xf59e0b
                      : p.kind === 'shield'
                        ? 0x06b6d4
                        : 0xa855f7,
                    7,
                    1.1,
                  );

                  if (sim.tutorialActive && sim.tutorialStage === 'powerups') {
                    sim.tutorialProgress += 1;
                    if (
                      sim.tutorialProgress >=
                      TUTORIAL_STAGE_META.powerups.target
                    ) {
                      advanceTutorialStage('completed');
                    }
                  }
                }
              }
              if (p.z > 12) {
                scene.remove(p.mesh);
                powerUps.splice(i, 1);
              }
            }

            // Update & Check Hazards
            for (let i = hazards.length - 1; i >= 0; i--) {
              const h = hazards[i];
              h.z += stepZ;

              if (h.active) {
                if (h.spinner) {
                  h.spinner.rotation.x += dt * 9;
                  h.spinner.rotation.z += dt * 5;
                }

                let currentHazardX = h.baseX;
                if (h.kind === 'drone') {
                  currentHazardX =
                    Math.sin(elapsedTotal * 2.1 + h.sweepPhase) * LANE_WIDTH;
                  if (h.laserBeam) {
                    const mat = h.laserBeam.material as THREE.MeshBasicMaterial;
                    mat.opacity =
                      0.35 + Math.abs(Math.sin(elapsedTotal * 12)) * 0.45;
                  }
                  if (!h.dodgedCounted && h.z > 1.5) {
                    h.dodgedCounted = true;
                    sim.dronesDodged += 1;
                  }
                }

                h.mesh.position.set(currentHazardX, 0, h.z);

                const zHitWindow = h.kind === 'gap' ? 1.35 : 0.72;
                if (Math.abs(h.z) < zHitWindow) {
                  const dx = Math.abs(currentHazardX - sim.x);
                  if (dx < 0.92) {
                    if (h.kind === 'speedpad') {
                      h.active = false;
                      sim.speedBoostTimer = 2.6;
                      sim.score += 100;
                      soundEngine.playDash();
                      spawnParticleBurst(
                        new THREE.Vector3(sim.x, 0.2, 0),
                        16,
                        0xf59e0b,
                        6,
                        1.0,
                      );
                    } else if (h.kind === 'hurdle') {
                      if (sim.y < 0.88 && !sim.isDashing) {
                        handleCollisionImpact(
                          h,
                          'Struck a carved sandstone hurdle',
                        );
                      }
                    } else if (h.kind === 'arch') {
                      if (!sim.isSliding && !sim.isDashing) {
                        handleCollisionImpact(
                          h,
                          'Clipped a spinning temple solar-blade',
                        );
                      }
                    } else if (h.kind === 'barrier') {
                      handleCollisionImpact(
                        h,
                        'Crashed into an ancient monolith barrier',
                      );
                    } else if (h.kind === 'gap') {
                      if (sim.y < 0.25 && !sim.isDashing) {
                        handleCollisionImpact(
                          h,
                          'Plummeted into an aqueduct bridge chasm',
                        );
                      }
                    } else if (h.kind === 'drone') {
                      if (!sim.isSliding && sim.y < 1.55) {
                        handleCollisionImpact(
                          h,
                          'Intercepted by a patrolling Sentinel Drone',
                        );
                      }
                    }
                  }
                }
              }

              if (h.z > 14) {
                scene.remove(h.mesh);
                hazards.splice(i, 1);
              }
            }

            const targetFov =
              sim.isDashing || sim.speedBoostTimer > 0 ? 74 : 62;
            camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
            camera.updateProjectionMatrix();

            sim.cameraShake = Math.max(0, sim.cameraShake - dt * 1.8);
            const shakeX = (Math.random() - 0.5) * sim.cameraShake;
            const shakeY = (Math.random() - 0.5) * sim.cameraShake;

            _camTargetPos.set(
              sim.x * 0.62 + shakeX,
              3.75 + sim.y * 0.35 + shakeY,
              6.35,
            );
            _camLookTarget.set(sim.x * 0.45, 1.45 + sim.y * 0.2, -10);

            camera.position.lerp(_camTargetPos, 1 - Math.exp(-10 * dt));
            _currentLookAt.lerp(_camLookTarget, 1 - Math.exp(-12 * dt));
            camera.lookAt(_currentLookAt);

            if (now - lastHudSync > 70) {
              lastHudSync = now;
              emitTelemetry();
            }
          }
        }

        for (let i = 0; i < MAX_PARTICLES; i++) {
          const p = particles[i];
          if (p.active) {
            p.life += dt;
            if (p.life >= p.maxLife) {
              p.active = false;
              _dummyObj.scale.setScalar(0);
              _dummyObj.updateMatrix();
              particleMesh.setMatrixAt(i, _dummyObj.matrix);
            } else {
              p.pos.addScaledVector(p.vel, dt);
              p.vel.y -= 14 * dt;
              const ratio = 1 - p.life / p.maxLife;
              _dummyObj.position.copy(p.pos);
              _dummyObj.rotation.set(p.life * 6, p.life * 4, 0);
              _dummyObj.scale.setScalar(p.scale * ratio);
              _dummyObj.updateMatrix();
              particleMesh.setMatrixAt(i, _dummyObj.matrix);
              _tempColor.copy(p.color);
              particleMesh.setColorAt(i, _tempColor);
            }
          } else {
            _dummyObj.scale.setScalar(0);
            _dummyObj.updateMatrix();
            particleMesh.setMatrixAt(i, _dummyObj.matrix);
          }
        }
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) {
          particleMesh.instanceColor.needsUpdate = true;
        }

        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }

      frameId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('resize', onResize);
        domElem.removeEventListener('pointerdown', onPointerDown);
        domElem.removeEventListener('touchstart', onTouchStart);
        domElem.removeEventListener('touchmove', onTouchMove);
        domElem.removeEventListener('touchend', onTouchEnd);
        renderer.dispose();
        if (domElem.parentNode === container) {
          container.removeChild(domElem);
        }
      };
    }, []);

    return (
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full overflow-hidden"
        aria-label="Relic Strider 3D Viewport"
      />
    );
  },
);
