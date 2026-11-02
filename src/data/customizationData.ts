import {
  ChassisSkin,
  VisorOptic,
  JetTrail,
  DailyChallenge,
  PlayerProfile,
} from '../types/game';

export const CHASSIS_SKINS: ChassisSkin[] = [
  {
    id: 'solar-gold',
    name: 'Solar Paladin',
    subtitle: 'Sun-forged travertine alloy with brushed gold plating',
    cost: 0,
    primaryColor: '#E5A93C',
    secondaryColor: '#3A2E28',
    trimColor: '#FFF0C2',
    metalness: 0.85,
    roughness: 0.22,
    clearcoat: 0.6,
  },
  {
    id: 'obsidian-relic',
    name: 'Obsidian Sentinel',
    subtitle: 'Volcanic basalt composite with burnished bronze trim',
    cost: 200,
    primaryColor: '#231F20',
    secondaryColor: '#4A3B32',
    trimColor: '#F59E0B',
    metalness: 0.78,
    roughness: 0.28,
    clearcoat: 0.8,
  },
  {
    id: 'jade-guardian',
    name: 'Jade Monolith',
    subtitle: 'Imperial celadon armor infused with ancient temple gold',
    cost: 400,
    primaryColor: '#0F766E',
    secondaryColor: '#1E293B',
    trimColor: '#FBBF24',
    metalness: 0.65,
    roughness: 0.2,
    clearcoat: 1.0,
  },
  {
    id: 'crimson-valkyrie',
    name: 'Crimson Sunforge',
    subtitle: 'Anodized carnelian exo-frame built for high-velocity dashes',
    cost: 650,
    primaryColor: '#B91C1C',
    secondaryColor: '#27272A',
    trimColor: '#FDE047',
    metalness: 0.88,
    roughness: 0.18,
    clearcoat: 0.9,
  },
  {
    id: 'astral-chrome',
    name: 'Astral Chronos',
    subtitle: 'Mirror-finished platinum hull with relic conduit inlays',
    cost: 950,
    primaryColor: '#E2E8F0',
    secondaryColor: '#0F172A',
    trimColor: '#38BDF8',
    metalness: 0.96,
    roughness: 0.12,
    clearcoat: 1.0,
  },
];

export const VISOR_OPTICS: VisorOptic[] = [
  {
    id: 'amber-hud',
    name: 'Solar Amber HUD',
    subtitle: 'High-contrast thermal sandstone horizon optics',
    cost: 0,
    glowColor: '#F59E0B',
    hexNumber: 0xf59e0b,
  },
  {
    id: 'cyan-pulse',
    name: 'Relic Cyan Array',
    subtitle: 'Precision trajectory scanner for multi-lane hazards',
    cost: 150,
    glowColor: '#06B6D4',
    hexNumber: 0x06b6d4,
  },
  {
    id: 'emerald-scanner',
    name: 'Jade Vector Lens',
    subtitle: 'Bio-luminescent temple glyph targeting visor',
    cost: 300,
    glowColor: '#10B981',
    hexNumber: 0x10b981,
  },
  {
    id: 'plasma-violet',
    name: 'Aether Singularity',
    subtitle: 'Deep-spectrum phase optics with hyper-void glow',
    cost: 500,
    glowColor: '#A855F7',
    hexNumber: 0xa855f7,
  },
];

export const JET_TRAILS: JetTrail[] = [
  {
    id: 'solar-flare',
    name: 'Solar Plasma',
    subtitle: 'Twin golden sun-fire thruster plumes',
    cost: 0,
    coreColor: '#FEF08A',
    outerColor: '#F59E0B',
  },
  {
    id: 'ion-stream',
    name: 'Ion Overdrive',
    subtitle: 'Superheated cyan ion streams with shock rings',
    cost: 200,
    coreColor: '#CFFAFE',
    outerColor: '#06B6D4',
  },
  {
    id: 'sandstorm-vortex',
    name: 'Sirocco Vortex',
    subtitle: 'Swirling golden desert embers and sandstone sparks',
    cost: 350,
    coreColor: '#FDE68A',
    outerColor: '#D97706',
  },
  {
    id: 'ancient-runes',
    name: 'Emerald Glyph Wake',
    subtitle: 'Crystalline jade energy particles trailing in flight',
    cost: 550,
    coreColor: '#A7F3D0',
    outerColor: '#10B981',
  },
];

const PROFILE_STORAGE_KEY = 'relic_strider_profile_v1';
const CHALLENGES_STORAGE_KEY = 'relic_strider_daily_challenges_v1';

export function loadPlayerProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (parsed && parsed.id) {
        if (typeof parsed.tutorialCompleted !== 'boolean') {
          parsed.tutorialCompleted = false;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not load profile from localStorage:', e);
  }

  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const initial: PlayerProfile = {
    id: `runner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    callsign: `STRIDER-${randomSuffix}`,
    coins: 120, // Starter grant so players can test customization quickly
    bestScore: 0,
    bestDistance: 0,
    totalRuns: 0,
    tutorialCompleted: false,
    unlockedSkins: ['solar-gold'],
    unlockedVisors: ['amber-hud'],
    unlockedTrails: ['solar-flare'],
    loadout: {
      skinId: 'solar-gold',
      visorId: 'amber-hud',
      trailId: 'solar-flare',
    },
  };
  savePlayerProfile(initial);
  return initial;
}

export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('Could not save profile to localStorage:', e);
  }
}

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

const CHALLENGE_POOL: Omit<DailyChallenge, 'id' | 'progress' | 'claimed'>[] = [
  {
    title: 'Sun-Coin Hoarder',
    description: 'Collect 80 Sun-Coins in a single temple run',
    metric: 'coins_single_run',
    target: 80,
    rewardCoins: 180,
  },
  {
    title: 'Monolith Breaker',
    description: 'Shatter 5 cracked stone barriers using your Cyber-Dash',
    metric: 'barriers_dashed',
    target: 5,
    rewardCoins: 220,
  },
  {
    title: 'Aqueduct Marathon',
    description: 'Reach 750m distance in a single run across the ruins',
    metric: 'distance_single_run',
    target: 750,
    rewardCoins: 250,
  },
  {
    title: 'Relic Conduit',
    description: 'Activate 4 in-run Power-Ups (Magnet, Shield, or 2x Multiplier)',
    metric: 'powerups_collected',
    target: 4,
    rewardCoins: 160,
  },
  {
    title: 'Sentinel Evasion',
    description: 'Evade 6 patrolling Sentinel Drone laser sweeps',
    metric: 'drones_dodged',
    target: 6,
    rewardCoins: 200,
  },
  {
    title: 'Treasury Expedition',
    description: 'Accumulate 200 total Sun-Coins across your runs today',
    metric: 'total_coins',
    target: 200,
    rewardCoins: 240,
  },
];

export function loadDailyChallenges(): { dateKey: string; challenges: DailyChallenge[] } {
  const todayKey = getTodayDateKey();
  try {
    const raw = localStorage.getItem(CHALLENGES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.dateKey === todayKey && Array.isArray(parsed.challenges)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read daily challenges:', e);
  }

  // Deterministically pick 3 challenges based on today's date string
  let hash = 0;
  for (let i = 0; i < todayKey.length; i++) {
    hash = (hash * 31 + todayKey.charCodeAt(i)) >>> 0;
  }

  const chosen: DailyChallenge[] = [];
  const poolCopy = [...CHALLENGE_POOL];
  for (let i = 0; i < 3; i++) {
    const idx = (hash + i * 7) % poolCopy.length;
    const item = poolCopy.splice(idx, 1)[0];
    chosen.push({
      ...item,
      id: `${todayKey}-challenge-${i}`,
      progress: 0,
      claimed: false,
    });
  }

  const result = { dateKey: todayKey, challenges: chosen };
  saveDailyChallenges(result.dateKey, result.challenges);
  return result;
}

export function saveDailyChallenges(dateKey: string, challenges: DailyChallenge[]): void {
  try {
    localStorage.setItem(
      CHALLENGES_STORAGE_KEY,
      JSON.stringify({ dateKey, challenges }),
    );
  } catch (e) {
    console.warn('Failed to save daily challenges:', e);
  }
}
