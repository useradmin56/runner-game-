# Relic Strider: 3D Endless Runner & Real-Time Global Arena

Relic Strider is a 60fps 3D endless runner set across Ancient Sunlit Ruins with crumbling sandstone bridges, solar-carved monoliths, and dynamic mechanical hazards. Players pilot an agile Cyber-Runner Suit across a three-lane aqueduct course, collecting ancient sun-coins to unlock modular chassis skins, visors, and jet-trails while competing on a real-time WebSocket global leaderboard and completing rotating daily challenges.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product and gameplay decisions reflect your confirmed choices and establish our technical and aesthetic foundation before building.

- **Confirmed World & Atmosphere**: **Ancient Sunlit Ruins** featuring warm travertine stone bridges, crumbling viaduct gaps, carved obelisks, golden-hour directional sunlight with cool sky hemisphere fill, and natural canyon cliff perimeters with atmospheric horizon fog.
- **Confirmed Character & Customization**: **Cyber-Runner Suit** constructed as a multi-part articulated 3D model (`THREE.Group`) with unlockable **Chassis Skins** (Solar Gold, Obsidian Relic, Jade Guardian, Crimson Valkyrie, Astral Chrome), **Visor Optics** (Amber HUD, Cyan Pulse, Emerald Scanner, Plasma Violet), and **Jet-Trails** (Solar Flare, Ion Stream, Sandstorm Vortex, Ancient Runes).
- **Confirmed Gameplay Mechanics & Live Features**:
  - **Three-Lane Procedural Course**: Jump over low stone hurdles and bridge chasms, slide under ancient archways and spinning solar blades, and dash-break through cracked sandstone barriers.
  - **Dynamic Speed Zones & Moving Hazard Drones**: Golden solar boost pads and patrolling sentinel drones with visible red laser windup telegraphs before lane sweeps.
  - **In-Run Power-Ups**: **Coin Magnet** (pulls coins across all three lanes), **Aegis Shield** (absorbs one hazard or drone impact with a shatter burst), and **2x Relic Multiplier** (doubles score and coin yield).
  - **Live Real-Time Global Leaderboard**: Server-authoritative WebSocket leaderboard broadcasting live high scores, active runner counts, and instant in-run rank-up notifications when passing global rivals.

---

### 1. Overview & Core Concept

- **What It Does**: Delivers an arcade-responsive 3D endless runner playable seamlessly on both mobile touchscreens (swipe & tap gestures with input buffering and coyote time) and desktop keyboards (`WASD` / Arrow keys + `Space` / `Shift`). Players progress through accelerating temple sectors, bank collected coins, customize their Cyber-Runner in an interactive 3D turntable hangar, track daily challenge streaks, and watch global leaderboard rankings update live.
- **Target Audience / Persona**: Mobile and desktop arcade action players who enjoy tactile movement mastery, cosmetic collection loops, daily goals, and real-time competitive high-score chasing.
- **Key Value**: Combines physically grounded Three.js PBR rendering (warm sunlit sandstone contrasted against sleek brushed-metal cyber armor) with zero-latency controls, procedural Web Audio synthesis, and real multi-user WebSocket leaderboard synchronization.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Title Screen & Live 3D Hangar**: Opens directly into a full-viewport 3D scene where the player's customized Cyber-Runner stands poised on an ancient sunlit bridge overlooking canyon ruins. A bespoke inline `<svg>` title lockup sits cleanly over negative space alongside a primary **Start Run** (`Enter` / `Space` or tap) CTA, a single control-hint line, and a compact bottom dock to switch between **Customize Suit**, **Daily Challenges**, and **Live Leaderboard**.
  2. **Active Run & Low-Occlusion HUD**: Transitioning to gameplay smoothly glides the camera into a dynamic third-person chase perspective. Over 85% of the viewport remains completely unobstructed. Perimeter HUD clusters display tabular score, distance (`m`), collected coins, active power-up timers, dash cooldown, and live rank overtake popups (`Passed #4 — +1 Rank!`).
  3. **Customization Hangar**: Players rotate and inspect their 10-part articulated Cyber-Runner Suit up close, previewing and purchasing **Chassis Finishes**, **Visors**, and **Jet-Trails** using earned coins, or equipping milestone rewards unlocked via Daily Challenges.
  4. **Daily Challenges & Run Summary Modal**: Completing a run triggers a crisp summary modal comparing the run's score and coins against personal bests, updating progress bars on the 3 Daily Challenges (e.g., *Collect 150 Coins in a Single Run*, *Shatter 8 Cracked Barriers with Dash*, *Reach 1,200m Without Taking Damage*), and immediately broadcasting new personal records to all connected players via WebSockets.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Sun-drenched archaeological monumentality meets high-precision futuristic exo-suit engineering ("Solar Relic Cybernetics").
  - *Color Palette & Mood*:
    - `--background`: Warm Sandstone Dusk (`#1C1613`) for UI backdrops and `#E8C99B` / `#D4A373` sunlit golden sky horizon fog in the 3D scene.
    - `--surface`: Carved Basalt (`rgba(28, 22, 19, 0.88)`) with crisp hairline borders (`rgba(245, 158, 11, 0.22)`) — no `backdrop-filter` over the active WebGL canvas to preserve 60fps performance across all GPUs.
    - `--primary`: Solar Amber (`#F59E0B`) for primary CTAs, speed boosts, and coin readouts.
    - `--accent`: Relic Cyan (`#06B6D4`) for cybernetic visor optics, shield energy, and live rank telemetry; Hazard Crimson (`#EF4444`) for sentinel drone telegraphs and barrier warnings.
  - *Typography & Hierarchy*:
    - **Display / HUD Headers**: `Chakra Petch` (or `Oxanium`) for angular, high-speed numeric readouts, distance meters, and rank banners.
    - **Body & Controls**: `Plus Jakarta Sans` for crisp, legible mission descriptions, customization labels, and button actions.
    - **Telemetry & Leaderboard Scores**: `JetBrains Mono` with `tabular-nums` so fast-ticking scores, distances, and global leaderboard columns remain vertically aligned.
  - *Component Styling & Layout*:
    - Full-viewport `100dvh` locked game shell with zero page scrollbars or website chrome.
    - Collapsible bottom control dock on the Title/Hangar screen (`▾ Hide Controls` / Zen camera mode) and ultra-light perimeter status clusters during active runs.
    - Zero static pill badges: metadata such as rank timestamps, distance milestones, and challenge rewards use clean inline typography with `·` separators.

- **Interactive Feedback & Motion**:
  - **Game Feel & Kinematics**: Frame-rate independent exponential damping (`THREE.MathUtils.damp`) on lane switches, camera FOV widening during speed zones, 50ms hitstop and decaying camera shake when smashing through cracked barriers or taking shield damage, squash-and-stretch on jump/land, and pooled instanced particle bursts for coin pickups and jet-trails.
  - **Procedural Web Audio Synth**: Zero external audio files; real-time Web Audio API oscillators and noise buffers generate melodic coin chimes, sub-bass dash impacts, stone crumble effects, drone laser windups, and shield recharge tones with a persistent mute toggle.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Procedural Chunk & Obstacle Generator with Fairness Guarantees**
  - *Chosen Approach*: Pattern-based procedural track generator using seeded difficulty tiers and object pooling (`THREE.InstancedMesh` and reusable obstacle groups). Every generated row validates that at least one lane is traversable via jump, slide, or dash-break.
  - *Why*: Purely random obstacle placement creates impossible walls in 3-lane runners. Pattern-validated chunks guarantee fair, skill-based runs that scale smoothly from relaxed introductory speeds to intense high-speed temple sectors with moving hazard drones.
  - *Alternatives Considered*: Static pre-built level loops (rejected because players quickly memorize layouts) or unvalidated random spawning (rejected due to unfair unavoidable collisions).

- **Decision 2: Server-Authoritative WebSocket Leaderboard + Persistent Local Progression**
  - *Chosen Approach*: Express + `ws` WebSocket server running on port 3000 maintains the live global leaderboard, active online runner presence, and real-time score broadcasts, paired with `localStorage` persistence for player coin balances, unlocked suit skins/visors/trails, and daily challenge progress.
  - *Why*: Gives players immediate real-time global rankings, live overtake toasts during runs, and instant cosmetic persistence without requiring mandatory account sign-up before playing.
  - *Alternatives Considered*: Polling REST endpoints (higher latency, misses instant live score updates) or client-only mock leaderboards (violates real-time multi-user authenticity).

- **Decision 3: Multi-Device Input Controller (Touch Gestures + Keyboard with Buffering)**
  - *Chosen Approach*: Unified input manager supporting mobile touch swipes (Left/Right lane change, Up jump, Down slide, Double-tap/Button dash) with a `< 35px` swipe threshold and `120ms` input buffer (so swiping Down while mid-air fast-falls and immediately slides upon landing), alongside desktop keyboard bindings (`WASD` / Arrows / `Space`).
  - *Why*: Mobile endless runners live or die by gesture responsiveness; input buffering and coyote time on bridge gaps eliminate frustrating dropped inputs.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION (React 19)                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                Isolated WebGL Canvas Container (useRef)               │  │
│  │  ┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │  │
│  │  │ 10-Part Cyber   │  │ Procedural Ruins     │  │ Pooled Coins,    │  │  │
│  │  │ Runner Suit     │  │ Track & Canyon Env   │  │ Power-Ups &      │  │  │
│  │  │ (Skin/Visor/Jet)│  │ (PBR + RoomEnv + Fog)│  │ Sentinel Drones  │  │  │
│  │  └────────┬────────┘  └──────────┬───────────┘  └────────┬─────────┘  │  │
│  │           └──────────────────────┼───────────────────────┘            │  │
│  │                                  ▼                                    │  │
│  │         60fps Simulation Loop (Clamped dt, AABB Collision,            │  │
│  │         Touch/Swipe + Keyboard Input Buffer, Web Audio Synth)         │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
│                                     │ Custom Events / Refs                  │
│  ┌──────────────────────────────────▼────────────────────────────────────┐  │
│  │                   Low-Occlusion Semantic HUD & Modals                 │  │
│  │  ┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌─────────────┐  │  │
│  │  │ Perimeter    │ │ Suit Hangar & │ │ Daily        │ │ Live Global │  │  │
│  │  │ Run HUD &    │ │ Skin Customizer│ │ Challenges   │ │ Leaderboard │  │  │
│  │  │ Rank Popups  │ │ Dock          │ │ Tracker      │ │ Drawer      │  │  │
│  │  └──────────────┘ └───────────────┘ └──────────────┘ └──────┬──────┘  │  │
│  └─────────────────────────────────────────────────────────────┼─────────┘  │
└────────────────────────────────────────────────────────────────┼────────────┘
                                                                 │ WebSocket (ws)
                                                                 ▼ & REST (/api/*)
┌─────────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS + WEBSOCKET SERVER (Port 3000)                    │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Authoritative Leaderboard State  │  │ Live Event Broadcaster          │  │
│  │ • Top Global High Scores         │  │ • leaderboard:init / update     │  │
│  │ • Player Callsigns & Suit Badges │  │ • runner:live_progress          │  │
│  │ • Daily Challenge Seed Sync      │  │ • presence:online_count         │  │
│  └──────────────────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Player Profile & Inventory**: `callsign`, `coins`, `bestScore`, `bestDistance`, `unlockedSkins[]`, `unlockedVisors[]`, `unlockedTrails[]`, and `equippedLoadout` (`skinId`, `visorId`, `trailId`).
  - **Daily Challenges State**: Deterministic date-seeded set of 3 daily challenges (`id`, `title`, `targetValue`, `currentValue`, `rewardCoins`, `claimed`, `type`: `'coins_single_run' | 'distance_total' | 'barriers_dashed' | 'powerups_collected' | 'near_misses'`).
  - **Leaderboard Entry**: `id`, `callsign`, `score`, `distance`, `coins`, `suitSkin`, `visorColor`, `timestamp`, and `isLiveRunning` status.
  - **In-Run Simulation State (Mutable Ref)**: `lane` (`-1 | 0 | 1`), `targetX`, `y`, `velocityY`, `isSliding`, `slideTimer`, `isDashing`, `dashTimer`, `dashCooldown`, `speed`, `distance`, `score`, `runCoins`, `activePowerUps` (`magnet`, `shield`, `multiplier`), and `hitstopTimer`.

- **Interactive Component & State Mapping**:
  - **Title & Hangar Controls**: Switching tabs in the bottom dock (`Play`, `Customize Suit`, `Daily Challenges`, `Global Leaderboard`) smoothly interpolates the 3D camera (`THREE.MathUtils.damp`) between the wide canyon bridge overview and a close-up hero turntable of the Cyber-Runner Suit.
  - **Customization Actions**: Clicking any Chassis Skin, Visor, or Jet-Trail immediately previews the material/color/particle change on the live 3D character. Owned items equip instantly; locked items validate `coins >= cost`, deduct coins, unlock the cosmetic, trigger a celebratory synth chord, and persist to storage.
  - **Daily Challenge Claims**: Progress increments in real time during runs; clicking `Claim Reward` on a completed challenge awards bonus coins with a floating `+Coins` animation.
  - **Live Leaderboard & Callsign Editor**: Players can customize their runner callsign at any time, filter leaderboard views (`All-Time Global`, `Today's Top Runners`, `Live Active`), and see real-time rank changes pushed via WebSocket events (`score:submitted`, `leaderboard:updated`, `presence:count`) with automatic reconnection and idempotent state reconciliation.
