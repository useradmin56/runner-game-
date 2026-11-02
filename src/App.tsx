import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  Coins,
  Shield,
  Zap,
  Magnet,
  Volume2,
  VolumeX,
  Music,
  Pause,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  Lock,
  Sparkles,
  Compass,
  Award,
  Sliders,
  Users,
  SkipForward,
  GraduationCap,
} from 'lucide-react';
import {
  BottomDockTab,
  DailyChallenge,
  GameScreenState,
  PlayerProfile,
  RankOvertakeToast,
  RunTelemetry,
  SuitLoadout,
} from './types/game';
import {
  CHASSIS_SKINS,
  VISOR_OPTICS,
  JET_TRAILS,
  loadDailyChallenges,
  loadPlayerProfile,
  saveDailyChallenges,
  savePlayerProfile,
} from './data/customizationData';
import {
  RunnerSceneCanvas,
  RunnerSceneHandle,
} from './three/RunnerSceneCanvas';
import { useLiveLeaderboard } from './hooks/useLiveLeaderboard';
import { soundEngine } from './audio/soundEngine';

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() =>
    loadPlayerProfile(),
  );
  const [dailyData, setDailyData] = useState<{
    dateKey: string;
    challenges: DailyChallenge[];
  }>(() => loadDailyChallenges());

  const [screenState, setScreenState] = useState<GameScreenState>('title');
  const [activeTab, setActiveTab] = useState<BottomDockTab>('play');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [customizerCategory, setCustomizerCategory] = useState<
    'skins' | 'visors' | 'trails'
  >('skins');
  const [previewLoadout, setPreviewLoadout] = useState<SuitLoadout>(
    () => profile.loadout,
  );
  const [editingCallsign, setEditingCallsign] = useState<string>(
    () => profile.callsign,
  );
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [musicOn, setMusicOn] = useState<boolean>(() =>
    soundEngine.isMusicEnabled(),
  );
  const [leaderboardFilter, setLeaderboardFilter] = useState<
    'all' | 'live'
  >('all');

  const [telemetry, setTelemetry] = useState<RunTelemetry>({
    score: 0,
    distance: 0,
    coins: 0,
    speed: 75,
    multiplierValue: 1,
    dashCooldownRatio: 0,
    isDashing: false,
    powerUps: { magnet: 0, shield: false, multiplier: 0 },
    barriersShattered: 0,
    powerUpsPicked: 0,
    dronesDodged: 0,
    currentRank: null,
  });

  const [rankToast, setRankToast] = useState<RankOvertakeToast | null>(null);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);

  const sceneRef = useRef<RunnerSceneHandle | null>(null);
  const prevRankRef = useRef<number | null>(null);
  const lastWsBroadcastRef = useRef<number>(0);

  const {
    leaderboard,
    activeRunners,
    onlineCount,
    connected,
    broadcastLiveProgress,
    submitFinalScore,
    syncProfileIdentity,
  } = useLiveLeaderboard(profile);

  // Sync preview loadout when profile loadout changes
  useEffect(() => {
    setPreviewLoadout(profile.loadout);
  }, [profile.loadout]);

  // Compute live global rank based on current run score or bestScore
  const liveRankInfo = useMemo(() => {
    const scoreToCompare =
      screenState === 'playing'
        ? Math.max(telemetry.score, profile.bestScore)
        : profile.bestScore;
    const otherEntries = leaderboard.filter((e) => e.id !== profile.id);
    let rank = 1;
    let nextRival: { callsign: string; score: number } | null = null;

    for (const item of otherEntries) {
      if (item.score > scoreToCompare) {
        rank++;
        nextRival = { callsign: item.callsign, score: item.score };
      }
    }
    return { rank, nextRival };
  }, [leaderboard, profile.id, profile.bestScore, screenState, telemetry.score]);

  // Detect live rank overtakes during an active run
  useEffect(() => {
    if (screenState !== 'playing') {
      prevRankRef.current = null;
      return;
    }

    const otherSorted = leaderboard
      .filter((e) => e.id !== profile.id)
      .sort((a, b) => b.score - a.score);

    let currentRunRank = 1;
    for (const rival of otherSorted) {
      if (rival.score >= telemetry.score) {
        currentRunRank++;
      }
    }

    if (
      prevRankRef.current !== null &&
      currentRunRank < prevRankRef.current &&
      telemetry.score > 100
    ) {
      const passedRival = otherSorted[currentRunRank - 1];
      if (passedRival) {
        soundEngine.playRankOvertake();
        setRankToast({
          id: `${Date.now()}`,
          newRank: currentRunRank,
          passedCallsign: passedRival.callsign,
          passedScore: passedRival.score,
        });
      }
    }
    prevRankRef.current = currentRunRank;
  }, [screenState, telemetry.score, leaderboard, profile.id]);

  useEffect(() => {
    if (!rankToast) return;
    const t = window.setTimeout(() => setRankToast(null), 3200);
    return () => clearTimeout(t);
  }, [rankToast]);

  useEffect(() => {
    if (!unlockNotice) return;
    const t = window.setTimeout(() => setUnlockNotice(null), 2600);
    return () => clearTimeout(t);
  }, [unlockNotice]);

  const showNotice = useCallback((msg: string) => {
    setUnlockNotice(msg);
  }, []);

  const handleStartRun = useCallback(
    (forceTutorial?: boolean) => {
      const runTutorial =
        typeof forceTutorial === 'boolean'
          ? forceTutorial
          : !profile.tutorialCompleted;

      setPreviewLoadout(profile.loadout);
      setRankToast(null);
      prevRankRef.current = null;
      setScreenState('playing');
      soundEngine.startMusic(true);

      sceneRef.current?.resetAndStartRun({
        tutorialMode: runTutorial,
        canSkipTutorial: true,
      });
      broadcastLiveProgress(0, 0, 0, true);
    },
    [profile.loadout, profile.tutorialCompleted, broadcastLiveProgress],
  );

  const handleTutorialCompleted = useCallback(() => {
    setProfile((prev) => {
      if (prev.tutorialCompleted) return prev;
      const updated: PlayerProfile = {
        ...prev,
        tutorialCompleted: true,
        coins: prev.coins + 50,
      };
      savePlayerProfile(updated);
      return updated;
    });
    showNotice('Tutorial Complete! +50 Sun-Coins Bonus Awarded');
  }, [showNotice]);

  // Keyboard shortcuts for starting from Title Screen or toggling Zen Dock ('H')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (screenState === 'title') {
        if (e.code === 'KeyH') {
          e.preventDefault();
          setDockCollapsed((prev) => !prev);
        } else if (
          (e.code === 'Enter' || e.code === 'Space') &&
          activeTab === 'play'
        ) {
          e.preventDefault();
          handleStartRun();
        }
      } else if (screenState === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartRun(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenState, activeTab, handleStartRun]);

  const handleTelemetryUpdate = useCallback(
    (newStats: RunTelemetry) => {
      setTelemetry(newStats);
      const now = performance.now();
      if (now - lastWsBroadcastRef.current > 900) {
        lastWsBroadcastRef.current = now;
        broadcastLiveProgress(
          newStats.score,
          newStats.distance,
          newStats.coins,
          true,
        );
      }
    },
    [broadcastLiveProgress],
  );

  const handleRunOver = useCallback(
    (finalStats: RunTelemetry) => {
      setTelemetry(finalStats);
      setScreenState('gameover');
      soundEngine.setMusicDynamics(65, false);

      // Update player profile coins & personal bests
      setProfile((prev) => {
        const updated: PlayerProfile = {
          ...prev,
          coins: prev.coins + finalStats.coins,
          bestScore: Math.max(prev.bestScore, finalStats.score),
          bestDistance: Math.max(prev.bestDistance, finalStats.distance),
          totalRuns: prev.totalRuns + 1,
        };
        savePlayerProfile(updated);
        return updated;
      });

      // Update Daily Challenges progress
      setDailyData((prev) => {
        const updatedChallenges = prev.challenges.map((ch) => {
          let nextProgress = ch.progress;
          if (ch.metric === 'coins_single_run') {
            nextProgress = Math.max(ch.progress, finalStats.coins);
          } else if (ch.metric === 'distance_single_run') {
            nextProgress = Math.max(ch.progress, finalStats.distance);
          } else if (ch.metric === 'barriers_dashed') {
            nextProgress = Math.min(
              ch.target,
              ch.progress + finalStats.barriersShattered,
            );
          } else if (ch.metric === 'powerups_collected') {
            nextProgress = Math.min(
              ch.target,
              ch.progress + finalStats.powerUpsPicked,
            );
          } else if (ch.metric === 'drones_dodged') {
            nextProgress = Math.min(
              ch.target,
              ch.progress + finalStats.dronesDodged,
            );
          } else if (ch.metric === 'total_coins') {
            nextProgress = Math.min(ch.target, ch.progress + finalStats.coins);
          }
          return {
            ...ch,
            progress: Math.min(ch.target, nextProgress),
          };
        });
        saveDailyChallenges(prev.dateKey, updatedChallenges);
        return { dateKey: prev.dateKey, challenges: updatedChallenges };
      });

      submitFinalScore(
        finalStats.score,
        finalStats.distance,
        finalStats.coins,
      );
    },
    [submitFinalScore],
  );

  const handleTogglePause = useCallback(() => {
    setScreenState((prev) => {
      if (prev === 'playing') {
        soundEngine.setMusicDynamics(60, false);
        return 'paused';
      }
      if (prev === 'paused') {
        soundEngine.setMusicDynamics(telemetry.speed, true);
        return 'playing';
      }
      return prev;
    });
  }, [telemetry.speed]);

  const handleToggleMute = () => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
    setMusicOn(soundEngine.isMusicEnabled());
  };

  const handleToggleMusic = () => {
    const nextMusic = soundEngine.toggleMusic();
    setMusicOn(nextMusic && !soundEngine.isMuted());
  };

  const handleSaveCallsign = () => {
    const clean =
      editingCallsign
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 16)
        .toUpperCase() || 'STRIDER-01';
    setEditingCallsign(clean);
    setProfile((prev) => {
      const updated = { ...prev, callsign: clean };
      savePlayerProfile(updated);
      syncProfileIdentity(
        clean,
        updated.loadout.skinId,
        updated.loadout.visorId,
        updated.loadout.trailId,
      );
      return updated;
    });
    showNotice(`Callsign updated to ${clean}`);
  };

  const handleSelectOrUnlockSkin = (skinId: string, cost: number, name: string) => {
    setPreviewLoadout((prev) => ({ ...prev, skinId }));
    if (profile.unlockedSkins.includes(skinId)) {
      setProfile((prev) => {
        const updated = {
          ...prev,
          loadout: { ...prev.loadout, skinId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          skinId,
          updated.loadout.visorId,
          updated.loadout.trailId,
        );
        return updated;
      });
      soundEngine.playLaneSwitch();
      return;
    }

    if (profile.coins >= cost) {
      soundEngine.playPowerUp();
      setProfile((prev) => {
        const updated: PlayerProfile = {
          ...prev,
          coins: prev.coins - cost,
          unlockedSkins: [...prev.unlockedSkins, skinId],
          loadout: { ...prev.loadout, skinId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          skinId,
          updated.loadout.visorId,
          updated.loadout.trailId,
        );
        return updated;
      });
      showNotice(`Unlocked & Equipped ${name}!`);
    }
  };

  const handleSelectOrUnlockVisor = (
    visorId: string,
    cost: number,
    name: string,
  ) => {
    setPreviewLoadout((prev) => ({ ...prev, visorId }));
    if (profile.unlockedVisors.includes(visorId)) {
      setProfile((prev) => {
        const updated = {
          ...prev,
          loadout: { ...prev.loadout, visorId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          updated.loadout.skinId,
          visorId,
          updated.loadout.trailId,
        );
        return updated;
      });
      soundEngine.playLaneSwitch();
      return;
    }

    if (profile.coins >= cost) {
      soundEngine.playPowerUp();
      setProfile((prev) => {
        const updated: PlayerProfile = {
          ...prev,
          coins: prev.coins - cost,
          unlockedVisors: [...prev.unlockedVisors, visorId],
          loadout: { ...prev.loadout, visorId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          updated.loadout.skinId,
          visorId,
          updated.loadout.trailId,
        );
        return updated;
      });
      showNotice(`Unlocked & Equipped ${name}!`);
    }
  };

  const handleSelectOrUnlockTrail = (
    trailId: string,
    cost: number,
    name: string,
  ) => {
    setPreviewLoadout((prev) => ({ ...prev, trailId }));
    if (profile.unlockedTrails.includes(trailId)) {
      setProfile((prev) => {
        const updated = {
          ...prev,
          loadout: { ...prev.loadout, trailId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          updated.loadout.skinId,
          updated.loadout.visorId,
          trailId,
        );
        return updated;
      });
      soundEngine.playLaneSwitch();
      return;
    }

    if (profile.coins >= cost) {
      soundEngine.playPowerUp();
      setProfile((prev) => {
        const updated: PlayerProfile = {
          ...prev,
          coins: prev.coins - cost,
          unlockedTrails: [...prev.unlockedTrails, trailId],
          loadout: { ...prev.loadout, trailId },
        };
        savePlayerProfile(updated);
        syncProfileIdentity(
          updated.callsign,
          updated.loadout.skinId,
          updated.loadout.visorId,
          trailId,
        );
        return updated;
      });
      showNotice(`Unlocked & Equipped ${name}!`);
    }
  };

  const handleClaimChallenge = (challengeId: string) => {
    const target = dailyData.challenges.find((c) => c.id === challengeId);
    if (!target || target.claimed || target.progress < target.target) return;

    soundEngine.playPowerUp();
    setDailyData((prev) => {
      const updated = prev.challenges.map((c) =>
        c.id === challengeId ? { ...c, claimed: true } : c,
      );
      saveDailyChallenges(prev.dateKey, updated);
      return { dateKey: prev.dateKey, challenges: updated };
    });

    setProfile((prev) => {
      const updated = { ...prev, coins: prev.coins + target.rewardCoins };
      savePlayerProfile(updated);
      return updated;
    });

    showNotice(`Claimed +${target.rewardCoins} Sun-Coins!`);
  };

  const unclaimedCompletedCount = useMemo(
    () =>
      dailyData.challenges.filter((c) => c.progress >= c.target && !c.claimed)
        .length,
    [dailyData.challenges],
  );

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#1C1613] text-[#F7EFE5] select-none">
      {/* Isolated 3D WebGL Viewport Container */}
      <RunnerSceneCanvas
        ref={sceneRef}
        screenState={screenState}
        activeTab={activeTab}
        loadout={screenState === 'title' ? previewLoadout : profile.loadout}
        onTelemetryUpdate={handleTelemetryUpdate}
        onRunOver={handleRunOver}
        onTogglePause={handleTogglePause}
        onTutorialCompleted={handleTutorialCompleted}
      />

      {/* Toast Notification Banner */}
      {unlockNotice && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#1C1613]/95 border border-amber-500/50 px-5 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 text-sm font-medium text-amber-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{unlockNotice}</span>
        </div>
      )}

      {/* =====================================================================
          1. TITLE SCREEN & HANGAR SHELL
         ===================================================================== */}
      {screenState === 'title' && (
        <div className="pointer-events-none relative z-10 w-full h-full flex flex-col justify-between p-4 sm:p-6">
          {/* Top Perimeter Bar: Bespoke SVG Brand Lockup + Player Treasury & Audio */}
          <div className="flex items-start justify-between gap-4">
            <div className="pointer-events-auto bg-[#1C1613]/90 border border-amber-500/25 rounded-xl px-4 py-3 shadow-lg max-w-md">
              {/* Bespoke Inline SVG Title Lockup */}
              <svg
                viewBox="0 0 340 52"
                className="w-60 sm:w-72 h-auto"
                aria-label="Relic Strider"
              >
                <defs>
                  <linearGradient
                    id="solarGoldGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#FEF08A" />
                    <stop offset="55%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                </defs>
                {/* Geometric Sun-Relic Emblem */}
                <polygon
                  points="22,6 38,26 22,46 6,26"
                  fill="none"
                  stroke="url(#solarGoldGrad)"
                  strokeWidth="2.5"
                />
                <polygon
                  points="22,14 30,26 22,38 14,26"
                  fill="#06B6D4"
                />
                <text
                  x="48"
                  y="30"
                  fill="url(#solarGoldGrad)"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fontSize="26"
                  letterSpacing="2"
                >
                  RELIC STRIDER
                </text>
                <text
                  x="50"
                  y="45"
                  fill="#D6C7B8"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="600"
                  fontSize="9.5"
                  letterSpacing="2.8"
                >
                  SOLAR RUINS · GLOBAL ARENA
                </text>
              </svg>

              <p className="mt-1.5 text-xs text-stone-300/90">
                WASD / Arrows Move &amp; Jump · S / ↓ Slide · Shift / Double-Tap
                Dash · Esc Pause
              </p>
            </div>

            {/* Right Perimeter Status Cluster */}
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-[#1C1613]/90 border border-amber-500/25 rounded-xl px-3.5 py-2.5 shadow-lg">
              <div className="flex items-center gap-1.5 pr-2 sm:pr-3 border-r border-stone-700/80">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-mono-tabular font-bold text-sm sm:text-base text-amber-300">
                  {profile.coins.toLocaleString()}
                </span>
                <span className="text-xs text-stone-400 hidden sm:inline">
                  Coins
                </span>
              </div>

              <div className="flex items-center gap-1.5 pr-2 sm:pr-3 border-r border-stone-700/80 text-xs text-stone-300">
                <Trophy className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-mono-tabular font-semibold">
                  #{liveRankInfo.rank}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-stone-400">
                  {onlineCount} Online
                </span>
              </div>

              <button
                onClick={handleToggleMusic}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  musicOn
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
                }`}
                title={musicOn ? 'Disable Dynamic Music' : 'Enable Dynamic Music'}
                aria-label="Toggle Dynamic Background Music"
              >
                <Music className="w-4 h-4" />
              </button>

              <button
                onClick={handleToggleMute}
                className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer"
                title={muted ? 'Unmute All Audio' : 'Mute All Audio'}
                aria-label={muted ? 'Unmute All Audio' : 'Mute All Audio'}
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
              </button>
            </div>
          </div>

          {/* Center Viewport kept 100% Unobstructed so the 3D Cyber-Runner & Sunlit Ruins shine */}
          {activeTab === 'customize' && !dockCollapsed && (
            <div className="self-center pointer-events-none text-xs text-stone-300/85 bg-[#1C1613]/75 px-3 py-1 rounded border border-stone-700/60">
              Drag horizontally on the 3D viewport to rotate your Cyber-Runner
              Suit
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock (Per Three.js Skill §5) */}
          <div className="pointer-events-auto self-center w-full max-w-[min(940px,96vw)] flex flex-col items-center">
            {/* Collapse / Expand Cinema Toggle Button */}
            <button
              onClick={() => setDockCollapsed((prev) => !prev)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-t-lg bg-[#1C1613]/95 border border-b-0 border-amber-500/30 text-xs font-medium text-stone-300 hover:text-amber-300 transition-colors cursor-pointer"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Show Controls (H)</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Hide Controls (H)</span>
                </>
              )}
            </button>

            {!dockCollapsed && (
              <div className="w-full bg-[#1C1613]/95 border border-amber-500/30 rounded-xl shadow-2xl p-4 sm:p-5 transition-transform duration-200">
                {/* Segmented Navigation Bar + Primary Start CTA */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-stone-800">
                  <div className="flex items-center gap-1 p-1 bg-stone-900/90 rounded-lg border border-stone-800">
                    <button
                      onClick={() => {
                        setActiveTab('play');
                        soundEngine.playLaneSwitch();
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'play'
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Expedition</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('customize');
                        soundEngine.playLaneSwitch();
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'customize'
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Suit Hangar</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('challenges');
                        soundEngine.playLaneSwitch();
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'challenges'
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>
                        Daily Challenges
                        {unclaimedCompletedCount > 0
                          ? ` (${unclaimedCompletedCount})`
                          : ''}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('leaderboard');
                        soundEngine.playLaneSwitch();
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'leaderboard'
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-stone-300 hover:text-white'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Global Leaderboard</span>
                    </button>
                  </div>

                  {/* Primary Action CTA Buttons */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => handleStartRun(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <GraduationCap className="w-4 h-4 text-cyan-400" />
                      <span>
                        {profile.tutorialCompleted
                          ? 'Replay Tutorial'
                          : 'Guided Tutorial'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleStartRun(false)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-sm tracking-wide shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Temple Run</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: EXPEDITION OVERVIEW */}
                {activeTab === 'play' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Runner Callsign & Loadout Summary */}
                    <div className="p-3.5 rounded-lg bg-stone-900/80 border border-stone-800">
                      <div className="text-xs text-stone-400 mb-1.5">
                        Runner Callsign (Global Feed)
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingCallsign}
                          onChange={(e) => setEditingCallsign(e.target.value)}
                          maxLength={16}
                          className="w-full bg-stone-950 border border-stone-700 rounded-md px-2.5 py-1.5 text-xs font-mono-tabular text-amber-200 focus:outline-none focus:border-amber-500"
                          placeholder="STRIDER-01"
                        />
                        <button
                          onClick={handleSaveCallsign}
                          className="px-3 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                      <div className="mt-2.5 text-xs text-stone-400 flex items-center gap-1.5">
                        <span>
                          Suit:{' '}
                          <strong className="text-stone-200">
                            {
                              CHASSIS_SKINS.find(
                                (s) => s.id === profile.loadout.skinId,
                              )?.name
                            }
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Tutorial:{' '}
                          <strong className="text-cyan-400">
                            {profile.tutorialCompleted
                              ? 'Graduated'
                              : 'Ready'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Personal Career Metrics */}
                    <div className="p-3.5 rounded-lg bg-stone-900/80 border border-stone-800 flex items-center justify-around">
                      <div>
                        <div className="text-xs text-stone-400">Best Score</div>
                        <div className="font-display font-bold text-xl text-amber-400 font-mono-tabular">
                          {profile.bestScore.toLocaleString()}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-stone-800" />
                      <div>
                        <div className="text-xs text-stone-400">
                          Best Distance
                        </div>
                        <div className="font-display font-bold text-xl text-stone-100 font-mono-tabular">
                          {profile.bestDistance.toLocaleString()}m
                        </div>
                      </div>
                      <div className="h-8 w-px bg-stone-800" />
                      <div>
                        <div className="text-xs text-stone-400">Global Rank</div>
                        <div className="font-display font-bold text-xl text-cyan-400 font-mono-tabular">
                          #{liveRankInfo.rank}
                        </div>
                      </div>
                    </div>

                    {/* Hazard & Power-Up Field Guide */}
                    <div className="p-3.5 rounded-lg bg-stone-900/80 border border-stone-800 text-xs space-y-1.5 text-stone-300">
                      <div className="font-semibold text-amber-300">
                        Temple Ruins Field Guide
                      </div>
                      <p>
                        <strong className="text-stone-100">
                          Cracked Monoliths:
                        </strong>{' '}
                        Press <span className="text-cyan-300">Shift</span> or{' '}
                        <span className="text-cyan-300">Double-Tap</span> to
                        shatter with Cyber-Dash (+250 pts).
                      </p>
                      <p>
                        <strong className="text-stone-100">
                          Sentinel Drones:
                        </strong>{' '}
                        Watch the red laser telegraph and switch lanes or slide
                        under.
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 2: SUIT CUSTOMIZATION HANGAR */}
                {activeTab === 'customize' && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            ['skins', 'Chassis Skins'],
                            ['visors', 'Visor Optics'],
                            ['trails', 'Jet-Trails'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setCustomizerCategory(key)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              customizerCategory === key
                                ? 'bg-stone-200 text-stone-950'
                                : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs text-stone-400">
                        Click any item to preview on your 3D Cyber-Runner Suit
                      </div>
                    </div>

                    {customizerCategory === 'skins' && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {CHASSIS_SKINS.map((skin) => {
                          const unlocked = profile.unlockedSkins.includes(
                            skin.id,
                          );
                          const equipped = profile.loadout.skinId === skin.id;
                          const previewing = previewLoadout.skinId === skin.id;
                          const canAfford = profile.coins >= skin.cost;

                          return (
                            <div
                              key={skin.id}
                              onClick={() =>
                                setPreviewLoadout((p) => ({
                                  ...p,
                                  skinId: skin.id,
                                }))
                              }
                              className={`p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                                previewing
                                  ? 'bg-stone-800/90 border-amber-500'
                                  : 'bg-stone-900/75 border-stone-800 hover:border-stone-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                                      style={{
                                        backgroundColor: skin.primaryColor,
                                      }}
                                    />
                                    <span
                                      className="w-2.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                                      style={{
                                        backgroundColor: skin.trimColor,
                                      }}
                                    />
                                  </div>
                                  {equipped && (
                                    <span className="text-[11px] font-semibold text-emerald-400">
                                      Equipped
                                    </span>
                                  )}
                                </div>
                                <div className="font-semibold text-xs text-stone-100 truncate">
                                  {skin.name}
                                </div>
                                <div className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                                  {skin.subtitle}
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectOrUnlockSkin(
                                    skin.id,
                                    skin.cost,
                                    skin.name,
                                  );
                                }}
                                disabled={!unlocked && !canAfford}
                                className={`mt-2.5 w-full py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                                  equipped
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : unlocked
                                      ? 'bg-stone-700 hover:bg-stone-600 text-white'
                                      : canAfford
                                        ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                                        : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                                }`}
                              >
                                {equipped ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Active</span>
                                  </>
                                ) : unlocked ? (
                                  <span>Equip</span>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span className="font-mono-tabular">
                                      {skin.cost} Coins
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {customizerCategory === 'visors' && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {VISOR_OPTICS.map((visor) => {
                          const unlocked = profile.unlockedVisors.includes(
                            visor.id,
                          );
                          const equipped = profile.loadout.visorId === visor.id;
                          const previewing = previewLoadout.visorId === visor.id;
                          const canAfford = profile.coins >= visor.cost;

                          return (
                            <div
                              key={visor.id}
                              onClick={() =>
                                setPreviewLoadout((p) => ({
                                  ...p,
                                  visorId: visor.id,
                                }))
                              }
                              className={`p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                                previewing
                                  ? 'bg-stone-800/90 border-amber-500'
                                  : 'bg-stone-900/75 border-stone-800 hover:border-stone-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span
                                    className="w-6 h-2.5 rounded-sm border border-white/20"
                                    style={{
                                      backgroundColor: visor.glowColor,
                                    }}
                                  />
                                  {equipped && (
                                    <span className="text-[11px] font-semibold text-emerald-400">
                                      Equipped
                                    </span>
                                  )}
                                </div>
                                <div className="font-semibold text-xs text-stone-100">
                                  {visor.name}
                                </div>
                                <div className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                                  {visor.subtitle}
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectOrUnlockVisor(
                                    visor.id,
                                    visor.cost,
                                    visor.name,
                                  );
                                }}
                                disabled={!unlocked && !canAfford}
                                className={`mt-2.5 w-full py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                                  equipped
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : unlocked
                                      ? 'bg-stone-700 hover:bg-stone-600 text-white'
                                      : canAfford
                                        ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                                        : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                                }`}
                              >
                                {equipped ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Active</span>
                                  </>
                                ) : unlocked ? (
                                  <span>Equip</span>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span className="font-mono-tabular">
                                      {visor.cost} Coins
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {customizerCategory === 'trails' && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {JET_TRAILS.map((trail) => {
                          const unlocked = profile.unlockedTrails.includes(
                            trail.id,
                          );
                          const equipped = profile.loadout.trailId === trail.id;
                          const previewing = previewLoadout.trailId === trail.id;
                          const canAfford = profile.coins >= trail.cost;

                          return (
                            <div
                              key={trail.id}
                              onClick={() =>
                                setPreviewLoadout((p) => ({
                                  ...p,
                                  trailId: trail.id,
                                }))
                              }
                              className={`p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                                previewing
                                  ? 'bg-stone-800/90 border-amber-500'
                                  : 'bg-stone-900/75 border-stone-800 hover:border-stone-700'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="w-3.5 h-3.5 rounded-sm"
                                      style={{
                                        backgroundColor: trail.coreColor,
                                      }}
                                    />
                                    <span
                                      className="w-3.5 h-3.5 rounded-sm"
                                      style={{
                                        backgroundColor: trail.outerColor,
                                      }}
                                    />
                                  </div>
                                  {equipped && (
                                    <span className="text-[11px] font-semibold text-emerald-400">
                                      Equipped
                                    </span>
                                  )}
                                </div>
                                <div className="font-semibold text-xs text-stone-100">
                                  {trail.name}
                                </div>
                                <div className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                                  {trail.subtitle}
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectOrUnlockTrail(
                                    trail.id,
                                    trail.cost,
                                    trail.name,
                                  );
                                }}
                                disabled={!unlocked && !canAfford}
                                className={`mt-2.5 w-full py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                                  equipped
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : unlocked
                                      ? 'bg-stone-700 hover:bg-stone-600 text-white'
                                      : canAfford
                                        ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                                        : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                                }`}
                              >
                                {equipped ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Active</span>
                                  </>
                                ) : unlocked ? (
                                  <span>Equip</span>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span className="font-mono-tabular">
                                      {trail.cost} Coins
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: DAILY CHALLENGES */}
                {activeTab === 'challenges' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {dailyData.challenges.map((ch) => {
                      const pct = Math.min(
                        100,
                        Math.round((ch.progress / ch.target) * 100),
                      );
                      const completed = ch.progress >= ch.target;

                      return (
                        <div
                          key={ch.id}
                          className="p-3.5 rounded-lg bg-stone-900/85 border border-stone-800 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-stone-100">
                                {ch.title}
                              </span>
                              <span className="text-xs font-mono-tabular text-amber-400 font-semibold">
                                +{ch.rewardCoins} Coins
                              </span>
                            </div>
                            <p className="text-xs text-stone-400 mt-1">
                              {ch.description}
                            </p>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between text-[11px] font-mono-tabular text-stone-300 mb-1">
                              <span>Progress</span>
                              <span>
                                {ch.progress} / {ch.target}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>

                            <button
                              onClick={() => handleClaimChallenge(ch.id)}
                              disabled={!completed || ch.claimed}
                              className={`mt-2.5 w-full py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                                ch.claimed
                                  ? 'bg-stone-800 text-emerald-400 cursor-default'
                                  : completed
                                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                                    : 'bg-stone-800/70 text-stone-500 cursor-not-allowed'
                              }`}
                            >
                              {ch.claimed
                                ? 'Reward Claimed'
                                : completed
                                  ? `Claim +${ch.rewardCoins} Coins`
                                  : 'In Progress'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TAB 4: LIVE GLOBAL LEADERBOARD */}
                {activeTab === 'leaderboard' && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setLeaderboardFilter('all')}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                            leaderboardFilter === 'all'
                              ? 'bg-stone-200 text-stone-950'
                              : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          Global Top Standings ({leaderboard.length})
                        </button>
                        <button
                          onClick={() => setLeaderboardFilter('live')}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            leaderboardFilter === 'live'
                              ? 'bg-stone-200 text-stone-950'
                              : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Active Runners ({activeRunners.length})</span>
                        </button>
                      </div>

                      <div className="text-xs text-stone-400">
                        {connected
                          ? 'Real-Time WebSocket Synced'
                          : 'Reconnecting Live Feed...'}
                      </div>
                    </div>

                    {leaderboardFilter === 'all' ? (
                      <div className="max-h-44 overflow-y-auto pr-1 space-y-1.5">
                        {leaderboard.slice(0, 12).map((entry, idx) => {
                          const isMe = entry.id === profile.id;
                          const skinObj =
                            CHASSIS_SKINS.find((s) => s.id === entry.skinId) ||
                            CHASSIS_SKINS[0];

                          return (
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${
                                isMe
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                  : 'bg-stone-900/75 border-stone-800/90 text-stone-200'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-mono-tabular font-bold w-6 text-stone-400">
                                  #{idx + 1}
                                </span>
                                <span
                                  className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
                                  style={{
                                    backgroundColor: skinObj.primaryColor,
                                  }}
                                />
                                <span className="font-semibold truncate">
                                  {entry.callsign}
                                  {isMe ? ' (You)' : ''}
                                </span>
                                <span className="text-stone-500 hidden sm:inline">
                                  · {skinObj.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-4 font-mono-tabular shrink-0">
                                <span className="text-stone-400">
                                  {entry.distance.toLocaleString()}m
                                </span>
                                <span className="font-bold text-amber-400 w-20 text-right">
                                  {entry.score.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="max-h-44 overflow-y-auto pr-1 space-y-1.5">
                        {activeRunners.length === 0 ? (
                          <div className="py-8 text-center text-xs text-stone-400">
                            No other runners actively on the bridge right now —
                            start a run to broadcast live!
                          </div>
                        ) : (
                          activeRunners.map((runner) => (
                            <div
                              key={runner.id}
                              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs bg-stone-900/75 border border-stone-800 text-stone-200"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="font-semibold text-cyan-300">
                                  {runner.callsign}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-stone-400">
                                  {runner.isRunning
                                    ? 'Running in Ruins'
                                    : 'In Suit Hangar'}
                                </span>
                              </div>
                              <div className="font-mono-tabular flex items-center gap-3">
                                <span className="text-stone-400">
                                  {runner.currentDistance}m
                                </span>
                                <span className="font-bold text-amber-400">
                                  {runner.currentScore.toLocaleString()} pts
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          2. ACTIVE RUN LOW-OCCLUSION HUD (85%+ Unobstructed Playfield)
         ===================================================================== */}
      {(screenState === 'playing' || screenState === 'paused') && (
        <div className="pointer-events-none relative z-10 w-full h-full flex flex-col justify-between p-4 sm:p-6">
          {/* Top Perimeter Telemetry Clusters */}
          <div className="flex items-start justify-between gap-3">
            {/* Top-Left: Score, Distance & Speed */}
            <div className="bg-[#1C1613]/90 border border-amber-500/30 rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-4">
              <div>
                <div className="text-[11px] text-stone-400">Score</div>
                <div className="font-display font-bold text-2xl sm:text-3xl text-amber-400 font-mono-tabular leading-tight">
                  {telemetry.score.toLocaleString()}
                </div>
              </div>

              <div className="h-8 w-px bg-stone-800" />

              <div>
                <div className="text-[11px] text-stone-400">Distance</div>
                <div className="font-display font-bold text-lg sm:text-xl text-stone-100 font-mono-tabular">
                  {telemetry.distance}m
                </div>
              </div>

              <div className="hidden sm:block h-8 w-px bg-stone-800" />

              <div className="hidden sm:block">
                <div className="text-[11px] text-stone-400">Pace</div>
                <div className="font-mono-tabular font-semibold text-sm text-cyan-300">
                  {telemetry.speed} km/h
                  {telemetry.multiplierValue > 1
                    ? ` · ${telemetry.multiplierValue}x`
                    : ''}
                </div>
              </div>
            </div>

            {/* Top-Right: Sun-Coins, Live Global Rank & Pause/Audio */}
            <div className="pointer-events-auto flex items-center gap-2 bg-[#1C1613]/90 border border-amber-500/30 rounded-xl px-3.5 py-2.5 shadow-lg">
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-stone-800">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="font-mono-tabular font-bold text-base text-amber-300">
                  {telemetry.coins}
                </span>
              </div>

              <div className="flex items-center gap-1.5 pr-2.5 border-r border-stone-800 text-xs">
                <Trophy className="w-4 h-4 text-cyan-400" />
                <span className="font-mono-tabular font-bold text-stone-100">
                  #{liveRankInfo.rank}
                </span>
                {liveRankInfo.nextRival && (
                  <span className="hidden md:inline text-stone-400 font-mono-tabular">
                    (Next: {liveRankInfo.nextRival.callsign}{' '}
                    {liveRankInfo.nextRival.score.toLocaleString()})
                  </span>
                )}
              </div>

              <button
                onClick={handleToggleMusic}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  musicOn
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
                title={musicOn ? 'Disable Music' : 'Enable Music'}
                aria-label="Toggle Background Music"
              >
                <Music className="w-4 h-4" />
              </button>

              <button
                onClick={handleToggleMute}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer"
                aria-label="Toggle Mute"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
              </button>

              <button
                onClick={handleTogglePause}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer"
                aria-label="Pause Game"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Guided Tutorial Banner (Skippable) */}
          {telemetry.tutorial && telemetry.tutorial.active && (
            <div className="pointer-events-auto self-center w-full max-w-xl bg-[#1C1613]/95 border border-cyan-500/50 rounded-xl px-4 py-3 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-display font-bold text-cyan-300 tracking-wide">
                  <GraduationCap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{telemetry.tutorial.title}</span>
                </div>

                {telemetry.tutorial.canSkip && (
                  <button
                    onClick={() => sceneRef.current?.skipTutorial()}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-[11px] font-semibold text-stone-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Skip Tutorial</span>
                    <SkipForward className="w-3 h-3" />
                  </button>
                )}
              </div>

              <p className="mt-1 text-xs text-stone-200">
                {telemetry.tutorial.instruction}
              </p>

              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        (telemetry.tutorial.progressCurrent /
                          Math.max(1, telemetry.tutorial.progressTarget)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono-tabular text-cyan-300 font-semibold">
                  {telemetry.tutorial.progressCurrent} /{' '}
                  {telemetry.tutorial.progressTarget}
                </span>
              </div>
            </div>
          )}

          {/* Live Global Rank Overtake Popup */}
          {rankToast && (
            <div className="self-center bg-[#1C1613]/95 border border-cyan-400/60 px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-3">
              <Trophy className="w-5 h-5 text-cyan-400 shrink-0" />
              <div className="text-xs">
                <div className="font-display font-bold text-cyan-300">
                  GLOBAL RANK UP! NOW #{rankToast.newRank}
                </div>
                <div className="text-stone-300">
                  Overtook <strong>{rankToast.passedCallsign}</strong> (
                  {rankToast.passedScore.toLocaleString()} pts)
                </div>
              </div>
            </div>
          )}

          {/* Bottom Perimeter: Active Power-Up Indicators & Touch Action Controls */}
          <div className="flex items-end justify-between gap-4">
            {/* Active Power-Up Timers */}
            <div className="flex flex-wrap items-center gap-2">
              {telemetry.powerUps.shield && (
                <div className="bg-[#1C1613]/90 border border-cyan-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs text-cyan-300 font-semibold">
                  <Shield className="w-4 h-4" />
                  <span>Aegis Shield Active</span>
                </div>
              )}
              {telemetry.powerUps.magnet > 0 && (
                <div className="bg-[#1C1613]/90 border border-amber-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs text-amber-300 font-mono-tabular font-semibold">
                  <Magnet className="w-4 h-4" />
                  <span>Magnet {telemetry.powerUps.magnet.toFixed(1)}s</span>
                </div>
              )}
              {telemetry.powerUps.multiplier > 0 && (
                <div className="bg-[#1C1613]/90 border border-purple-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs text-purple-300 font-mono-tabular font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    2x Score {telemetry.powerUps.multiplier.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>

            {/* Cyber-Dash Action Button (Works on both Mobile Touch & Desktop Click) */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={() => sceneRef.current?.triggerAction('dash')}
                disabled={telemetry.dashCooldownRatio > 0}
                className={`relative overflow-hidden px-4 py-3 rounded-xl font-display font-bold text-xs tracking-wider border transition-transform active:scale-95 cursor-pointer flex items-center gap-2 ${
                  telemetry.dashCooldownRatio <= 0
                    ? 'bg-cyan-500 text-stone-950 border-cyan-300 shadow-lg'
                    : 'bg-[#1C1613]/90 text-stone-400 border-stone-700'
                }`}
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {telemetry.dashCooldownRatio <= 0
                    ? 'CYBER-DASH (SHIFT)'
                    : 'RECHARGING...'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. PAUSE MODAL
         ===================================================================== */}
      {screenState === 'paused' && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1C1613] border border-amber-500/35 rounded-2xl p-6 shadow-2xl">
            <h2 className="font-display font-bold text-2xl text-amber-400">
              Expedition Paused
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Current Distance: {telemetry.distance}m · Score:{' '}
              {telemetry.score.toLocaleString()}
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={handleTogglePause}
                className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Run</span>
              </button>

              <button
                onClick={() => handleStartRun(false)}
                className="w-full py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Run</span>
              </button>

              <button
                onClick={() => {
                  soundEngine.setMusicDynamics(60, false);
                  setScreenState('title');
                }}
                className="w-full py-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-stone-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Return to Suit Hangar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. GAME OVER / EXPEDITION SUMMARY MODAL
         ===================================================================== */}
      {screenState === 'gameover' && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#1C1613] border border-amber-500/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-red-400">
                  {telemetry.causeOfDefeat || 'Run Terminated in the Ruins'}
                </div>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-stone-100 mt-0.5">
                  Expedition Complete
                </h2>
              </div>

              <div className="text-right">
                <div className="text-xs text-stone-400">Global Standing</div>
                <div className="font-display font-bold text-2xl text-cyan-400 font-mono-tabular">
                  #{liveRankInfo.rank}
                </div>
              </div>
            </div>

            {/* Run KPI Grid */}
            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800">
                <div className="text-xs text-stone-400">Final Score</div>
                <div className="font-display font-bold text-xl text-amber-400 font-mono-tabular mt-0.5">
                  {telemetry.score.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800">
                <div className="text-xs text-stone-400">Distance</div>
                <div className="font-display font-bold text-xl text-stone-100 font-mono-tabular mt-0.5">
                  {telemetry.distance}m
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800">
                <div className="text-xs text-stone-400">Coins Banked</div>
                <div className="font-display font-bold text-xl text-amber-300 font-mono-tabular mt-0.5">
                  +{telemetry.coins}
                </div>
              </div>
            </div>

            {/* Daily Challenges Quick Status */}
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-800/90 mb-5">
              <div className="text-xs font-semibold text-stone-300 mb-2">
                Daily Challenge Progress
              </div>
              <div className="space-y-2">
                {dailyData.challenges.map((ch) => {
                  const pct = Math.min(
                    100,
                    Math.round((ch.progress / ch.target) * 100),
                  );
                  const readyToClaim = ch.progress >= ch.target && !ch.claimed;

                  return (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-stone-300 truncate w-44">
                        {ch.title}
                      </span>
                      <div className="flex-1 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {readyToClaim ? (
                        <button
                          onClick={() => handleClaimChallenge(ch.id)}
                          className="px-2.5 py-0.5 rounded bg-amber-500 text-stone-950 font-semibold text-[11px] whitespace-nowrap cursor-pointer"
                        >
                          Claim +{ch.rewardCoins}
                        </button>
                      ) : (
                        <span className="font-mono-tabular text-stone-400 w-14 text-right">
                          {ch.claimed
                            ? 'Done'
                            : `${ch.progress}/${ch.target}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => handleStartRun(false)}
                className="w-full sm:flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Run Again (Enter / Space)</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('customize');
                  setScreenState('title');
                }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Customize Suit ({profile.coins} Coins)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
