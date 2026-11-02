import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActiveRunnerState,
  LeaderboardEntry,
  PlayerProfile,
} from '../types/game';

export function useLiveLeaderboard(profile: PlayerProfile) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeRunners, setActiveRunners] = useState<ActiveRunnerState[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [connected, setConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const profileRef = useRef<PlayerProfile>(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Initial REST fetch fallback so leaderboard is populated immediately
  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
        }
        if (data && Array.isArray(data.activeRunners)) {
          setActiveRunners(data.activeRunners);
        }
        if (data && typeof data.onlineCount === 'number') {
          setOnlineCount(Math.max(1, data.onlineCount));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnected(true);
        const p = profileRef.current;
        ws.send(
          JSON.stringify({
            type: 'runner:register',
            id: p.id,
            callsign: p.callsign,
            currentScore: 0,
            currentDistance: 0,
            skinId: p.loadout.skinId,
            visorId: p.loadout.visorId,
            isRunning: false,
          }),
        );
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'leaderboard:init' || msg.type === 'leaderboard:update') {
            if (Array.isArray(msg.leaderboard)) {
              setLeaderboard(msg.leaderboard);
            }
            if (Array.isArray(msg.activeRunners)) {
              setActiveRunners(msg.activeRunners);
            }
            if (typeof msg.onlineCount === 'number') {
              setOnlineCount(Math.max(1, msg.onlineCount));
            }
          } else if (msg.type === 'presence:update') {
            if (typeof msg.onlineCount === 'number') {
              setOnlineCount(Math.max(1, msg.onlineCount));
            }
            if (Array.isArray(msg.activeRunners)) {
              setActiveRunners(msg.activeRunners);
            }
          } else if (msg.type === 'runner:live_progress') {
            if (Array.isArray(msg.activeRunners)) {
              setActiveRunners(msg.activeRunners);
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const broadcastLiveProgress = useCallback(
    (score: number, distance: number, coins: number, isRunning: boolean) => {
      const ws = wsRef.current;
      const p = profileRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'runner:progress',
            id: p.id,
            callsign: p.callsign,
            score: Math.floor(score),
            distance: Math.floor(distance),
            coins: Math.floor(coins),
            skinId: p.loadout.skinId,
            visorId: p.loadout.visorId,
            trailId: p.loadout.trailId,
            isRunning,
          }),
        );
      }
    },
    [],
  );

  const submitFinalScore = useCallback(
    (score: number, distance: number, coins: number) => {
      const p = profileRef.current;
      const entry: LeaderboardEntry = {
        id: p.id,
        callsign: p.callsign,
        score: Math.floor(score),
        distance: Math.floor(distance),
        coins: Math.floor(coins),
        skinId: p.loadout.skinId,
        visorId: p.loadout.visorId,
        trailId: p.loadout.trailId,
        updatedAt: Date.now(),
      };

      // Optimistic local update
      setLeaderboard((prev) => {
        const copy = [...prev];
        const idx = copy.findIndex((item) => item.id === entry.id);
        if (idx >= 0) {
          if (entry.score > copy[idx].score) {
            copy[idx] = entry;
          } else {
            copy[idx] = {
              ...copy[idx],
              callsign: entry.callsign,
              skinId: entry.skinId,
              visorId: entry.visorId,
              trailId: entry.trailId,
            };
          }
        } else {
          copy.push(entry);
        }
        copy.sort((a, b) => b.score - a.score);
        return copy.slice(0, 50);
      });

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'score:submit',
            entry,
          }),
        );
      } else {
        fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.leaderboard)) {
              setLeaderboard(data.leaderboard);
            }
          })
          .catch(() => {});
      }
    },
    [],
  );

  const syncProfileIdentity = useCallback(
    (callsign: string, skinId: string, visorId: string, trailId: string) => {
      const ws = wsRef.current;
      const p = profileRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'profile:update',
            id: p.id,
            callsign,
            skinId,
            visorId,
            trailId,
          }),
        );
      }
    },
    [],
  );

  return {
    leaderboard,
    activeRunners,
    onlineCount,
    connected,
    broadcastLiveProgress,
    submitFinalScore,
    syncProfileIdentity,
  };
}
