export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type BottomDockTab = 'play' | 'customize' | 'challenges' | 'leaderboard';

export type TutorialStageId =
  | 'movement'
  | 'obstacles'
  | 'coins'
  | 'powerups'
  | 'completed';

export interface TutorialProgressState {
  active: boolean;
  stage: TutorialStageId;
  stepIndex: number; // 0 to 4
  title: string;
  instruction: string;
  progressCurrent: number;
  progressTarget: number;
  canSkip: boolean;
}

export interface ChassisSkin {
  id: string;
  name: string;
  subtitle: string;
  cost: number;
  primaryColor: string;
  secondaryColor: string;
  trimColor: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface VisorOptic {
  id: string;
  name: string;
  subtitle: string;
  cost: number;
  glowColor: string;
  hexNumber: number;
}

export interface JetTrail {
  id: string;
  name: string;
  subtitle: string;
  cost: number;
  coreColor: string;
  outerColor: string;
}

export interface SuitLoadout {
  skinId: string;
  visorId: string;
  trailId: string;
}

export type ChallengeMetricType =
  | 'coins_single_run'
  | 'distance_single_run'
  | 'barriers_dashed'
  | 'powerups_collected'
  | 'drones_dodged'
  | 'total_coins';

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  metric: ChallengeMetricType;
  target: number;
  progress: number;
  rewardCoins: number;
  claimed: boolean;
}

export interface LeaderboardEntry {
  id: string;
  callsign: string;
  score: number;
  distance: number;
  coins: number;
  skinId: string;
  visorId: string;
  trailId: string;
  updatedAt: number;
}

export interface ActiveRunnerState {
  id: string;
  callsign: string;
  currentScore: number;
  currentDistance: number;
  skinId: string;
  visorId: string;
  isRunning: boolean;
  updatedAt: number;
}

export interface RankOvertakeToast {
  id: string;
  newRank: number;
  passedCallsign: string;
  passedScore: number;
}

export interface ActivePowerUps {
  magnet: number; // remaining seconds
  shield: boolean;
  multiplier: number; // remaining seconds
}

export interface RunTelemetry {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  multiplierValue: number;
  dashCooldownRatio: number; // 0 = ready, 1 = cooling down
  isDashing: boolean;
  powerUps: ActivePowerUps;
  barriersShattered: number;
  powerUpsPicked: number;
  dronesDodged: number;
  currentRank: number | null;
  tutorial?: TutorialProgressState;
  causeOfDefeat?: string;
}

export interface PlayerProfile {
  id: string;
  callsign: string;
  coins: number;
  bestScore: number;
  bestDistance: number;
  totalRuns: number;
  tutorialCompleted: boolean;
  unlockedSkins: string[];
  unlockedVisors: string[];
  unlockedTrails: string[];
  loadout: SuitLoadout;
}
