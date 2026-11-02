import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerLeaderboardEntry {
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

const DATA_FILE = path.join(__dirname, 'leaderboard-data.json');

const INITIAL_LEADERBOARD: ServerLeaderboardEntry[] = [
  {
    id: 'seed-1',
    callsign: 'SOLARIS-IX',
    score: 24850,
    distance: 2140,
    coins: 412,
    skinId: 'astral-chrome',
    visorId: 'cyan-pulse',
    trailId: 'ion-stream',
    updatedAt: Date.now() - 1000 * 60 * 42,
  },
  {
    id: 'seed-2',
    callsign: 'VALKYRIE-07',
    score: 18420,
    distance: 1680,
    coins: 315,
    skinId: 'crimson-valkyrie',
    visorId: 'amber-hud',
    trailId: 'solar-flare',
    updatedAt: Date.now() - 1000 * 60 * 85,
  },
  {
    id: 'seed-3',
    callsign: 'JADE-SPECTRE',
    score: 14200,
    distance: 1320,
    coins: 260,
    skinId: 'jade-guardian',
    visorId: 'emerald-scanner',
    trailId: 'ancient-runes',
    updatedAt: Date.now() - 1000 * 60 * 130,
  },
  {
    id: 'seed-4',
    callsign: 'KRONOS-DRIFT',
    score: 10650,
    distance: 990,
    coins: 198,
    skinId: 'obsidian-relic',
    visorId: 'plasma-violet',
    trailId: 'sandstorm-vortex',
    updatedAt: Date.now() - 1000 * 60 * 190,
  },
  {
    id: 'seed-5',
    callsign: 'ATMOS-RUNNER',
    score: 7840,
    distance: 760,
    coins: 145,
    skinId: 'solar-gold',
    visorId: 'cyan-pulse',
    trailId: 'solar-flare',
    updatedAt: Date.now() - 1000 * 60 * 240,
  },
  {
    id: 'seed-6',
    callsign: 'NEXUS-STRIDER',
    score: 5290,
    distance: 540,
    coins: 112,
    skinId: 'obsidian-relic',
    visorId: 'amber-hud',
    trailId: 'ion-stream',
    updatedAt: Date.now() - 1000 * 60 * 310,
  },
  {
    id: 'seed-7',
    callsign: 'HELIOS-Vanguard',
    score: 3450,
    distance: 380,
    coins: 78,
    skinId: 'solar-gold',
    visorId: 'amber-hud',
    trailId: 'solar-flare',
    updatedAt: Date.now() - 1000 * 60 * 400,
  },
  {
    id: 'seed-8',
    callsign: 'DUNE-SEEKER',
    score: 1680,
    distance: 210,
    coins: 44,
    skinId: 'jade-guardian',
    visorId: 'emerald-scanner',
    trailId: 'sandstorm-vortex',
    updatedAt: Date.now() - 1000 * 60 * 520,
  },
];

function loadLeaderboard(): ServerLeaderboardEntry[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read leaderboard file, using initial seed:', err);
  }
  return [...INITIAL_LEADERBOARD];
}

function saveLeaderboard(entries: ServerLeaderboardEntry[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist leaderboard:', err);
  }
}

let leaderboard: ServerLeaderboardEntry[] = loadLeaderboard();
const activeRunners = new Map<string, ActiveRunnerState>();
const clientRunnerIds = new Map<WebSocket, string>();

function sortAndTrimLeaderboard() {
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 50) {
    leaderboard = leaderboard.slice(0, 50);
  }
}

sortAndTrimLeaderboard();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // WebSocket server attached to the same HTTP server on port 3000
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(payload: unknown) {
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  function upsertScore(entry: ServerLeaderboardEntry): {
    rank: number;
    isNewBest: boolean;
  } {
    const cleanCallsign = (entry.callsign || 'STRIDER-01')
      .trim()
      .slice(0, 18)
      .toUpperCase();
    const existingIdx = leaderboard.findIndex((item) => item.id === entry.id);
    let isNewBest = false;

    if (existingIdx >= 0) {
      const existing = leaderboard[existingIdx];
      existing.callsign = cleanCallsign;
      existing.skinId = entry.skinId || existing.skinId;
      existing.visorId = entry.visorId || existing.visorId;
      existing.trailId = entry.trailId || existing.trailId;
      if (entry.score > existing.score) {
        existing.score = Math.round(entry.score);
        existing.distance = Math.round(entry.distance);
        existing.coins = Math.round(entry.coins);
        existing.updatedAt = Date.now();
        isNewBest = true;
      }
    } else {
      leaderboard.push({
        id: entry.id,
        callsign: cleanCallsign,
        score: Math.round(entry.score),
        distance: Math.round(entry.distance),
        coins: Math.round(entry.coins),
        skinId: entry.skinId || 'solar-gold',
        visorId: entry.visorId || 'amber-hud',
        trailId: entry.trailId || 'solar-flare',
        updatedAt: Date.now(),
      });
      isNewBest = true;
    }

    sortAndTrimLeaderboard();
    if (isNewBest) {
      saveLeaderboard(leaderboard);
    }

    const rank = leaderboard.findIndex((item) => item.id === entry.id) + 1;
    return { rank, isNewBest };
  }

  wss.on('connection', (ws) => {
    // Send authoritative state immediately on connect
    ws.send(
      JSON.stringify({
        type: 'leaderboard:init',
        leaderboard,
        activeRunners: Array.from(activeRunners.values()),
        onlineCount: wss.clients.size,
      }),
    );

    broadcast({
      type: 'presence:update',
      onlineCount: wss.clients.size,
      activeRunners: Array.from(activeRunners.values()),
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'runner:register' && msg.id) {
          clientRunnerIds.set(ws, String(msg.id));
          activeRunners.set(String(msg.id), {
            id: String(msg.id),
            callsign: String(msg.callsign || 'STRIDER-01')
              .trim()
              .slice(0, 18)
              .toUpperCase(),
            currentScore: Number(msg.currentScore) || 0,
            currentDistance: Number(msg.currentDistance) || 0,
            skinId: String(msg.skinId || 'solar-gold'),
            visorId: String(msg.visorId || 'amber-hud'),
            isRunning: Boolean(msg.isRunning),
            updatedAt: Date.now(),
          });
          broadcast({
            type: 'presence:update',
            onlineCount: wss.clients.size,
            activeRunners: Array.from(activeRunners.values()),
          });
        } else if (msg.type === 'runner:progress' && msg.id) {
          const id = String(msg.id);
          clientRunnerIds.set(ws, id);
          const runnerState: ActiveRunnerState = {
            id,
            callsign: String(msg.callsign || 'STRIDER-01')
              .trim()
              .slice(0, 18)
              .toUpperCase(),
            currentScore: Math.round(Number(msg.score) || 0),
            currentDistance: Math.round(Number(msg.distance) || 0),
            skinId: String(msg.skinId || 'solar-gold'),
            visorId: String(msg.visorId || 'amber-hud'),
            isRunning: Boolean(msg.isRunning),
            updatedAt: Date.now(),
          };
          activeRunners.set(id, runnerState);

          // Also update live high score if player beats their personal best mid-run
          if (runnerState.currentScore > 100) {
            const { isNewBest } = upsertScore({
              id,
              callsign: runnerState.callsign,
              score: runnerState.currentScore,
              distance: runnerState.currentDistance,
              coins: Math.round(Number(msg.coins) || 0),
              skinId: runnerState.skinId,
              visorId: runnerState.visorId,
              trailId: String(msg.trailId || 'solar-flare'),
              updatedAt: Date.now(),
            });
            if (isNewBest) {
              broadcast({
                type: 'leaderboard:update',
                leaderboard,
                activeRunners: Array.from(activeRunners.values()),
              });
            }
          }

          broadcast({
            type: 'runner:live_progress',
            runner: runnerState,
            activeRunners: Array.from(activeRunners.values()),
          });
        } else if (msg.type === 'score:submit' && msg.entry) {
          const entry = msg.entry as ServerLeaderboardEntry;
          if (!entry.id || typeof entry.score !== 'number') return;

          const existingRunner = activeRunners.get(entry.id);
          if (existingRunner) {
            existingRunner.isRunning = false;
            existingRunner.currentScore = Math.round(entry.score);
            existingRunner.currentDistance = Math.round(entry.distance);
            existingRunner.updatedAt = Date.now();
          }

          const { rank } = upsertScore(entry);
          broadcast({
            type: 'leaderboard:update',
            leaderboard,
            latestSubmission: {
              id: entry.id,
              callsign: entry.callsign,
              score: Math.round(entry.score),
              rank,
            },
            activeRunners: Array.from(activeRunners.values()),
          });
        } else if (msg.type === 'profile:update' && msg.id) {
          const id = String(msg.id);
          const cleanCallsign = String(msg.callsign || 'STRIDER-01')
            .trim()
            .slice(0, 18)
            .toUpperCase();
          const existing = leaderboard.find((item) => item.id === id);
          if (existing) {
            existing.callsign = cleanCallsign;
            if (msg.skinId) existing.skinId = String(msg.skinId);
            if (msg.visorId) existing.visorId = String(msg.visorId);
            if (msg.trailId) existing.trailId = String(msg.trailId);
            saveLeaderboard(leaderboard);
          }
          const runner = activeRunners.get(id);
          if (runner) {
            runner.callsign = cleanCallsign;
            if (msg.skinId) runner.skinId = String(msg.skinId);
            if (msg.visorId) runner.visorId = String(msg.visorId);
          }
          broadcast({
            type: 'leaderboard:update',
            leaderboard,
            activeRunners: Array.from(activeRunners.values()),
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      const runnerId = clientRunnerIds.get(ws);
      if (runnerId) {
        activeRunners.delete(runnerId);
        clientRunnerIds.delete(ws);
      }
      broadcast({
        type: 'presence:update',
        onlineCount: wss.clients.size,
        activeRunners: Array.from(activeRunners.values()),
      });
    });
  });

  // REST API routes
  app.get('/api/leaderboard', (_req, res) => {
    res.json({
      leaderboard,
      activeRunners: Array.from(activeRunners.values()),
      onlineCount: wss.clients.size,
    });
  });

  app.post('/api/score', (req, res) => {
    const entry = req.body as ServerLeaderboardEntry;
    if (!entry || !entry.id || typeof entry.score !== 'number') {
      res.status(400).json({ error: 'Invalid score payload' });
      return;
    }
    const { rank, isNewBest } = upsertScore(entry);
    broadcast({
      type: 'leaderboard:update',
      leaderboard,
      latestSubmission: {
        id: entry.id,
        callsign: entry.callsign,
        score: Math.round(entry.score),
        rank,
      },
      activeRunners: Array.from(activeRunners.values()),
    });
    res.json({ leaderboard, rank, isNewBest });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Relic Strider Server + WebSocket listening on http://localhost:${PORT}`);
  });
}

startServer();
