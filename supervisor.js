// supervisor.js — herstart workers, houdt API draaiend
const { fork } = require('child_process');
const express = require('express');
const cors = require('cors');
const { KITS, RECONNECT } = require('./config');

// ============================================
// GLOBALE CRASH-BEVEILIGING (supervisor zelf)
// ============================================
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] supervisor uncaughtException:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] supervisor unhandledRejection:', reason);
});

// ============================================
// LEADERBOARD STATE (gedeeld via IPC met workers)
// ============================================
const allLeaderboards = {};
for (const kit of KITS) allLeaderboards[kit] = [];

// ============================================
// WORKER MANAGEMENT
// ============================================
const workers = {}; // role -> child
const restartCount = {}; // role -> aantal herstarts

function spawnWorker(role) {
  console.log(`[supervisor] ${role} starten...`);

  const child = fork('./worker.js', [role], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  workers[role] = child;
  restartCount[role] = restartCount[role] || 0;

  // ---- IPC: leaderboard updates + crash meldingen ----
  child.on('message', (msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'leaderboard') {
      const list = allLeaderboards[msg.kit];
      if (!list) return;

      const idx = list.findIndex((p) => p.player === msg.player);
      const obj = { player: msg.player, rating: msg.rating };

      if (idx !== -1) list[idx] = obj;
      else list.push(obj);
    }

    if (msg.type === 'crash') {
      console.warn(`[supervisor] ${role} crash: ${msg.message}`);
    }
  });

  // ---- Herstart bij exit (crash of normaal einde) ----
  child.on('exit', (code, signal) => {
    workers[role] = null;
    restartCount[role] += 1;

    const delay = Math.min(
      RECONNECT.initialDelay * restartCount[role],
      RECONNECT.maxDelay
    );
    console.log(
      `[supervisor] ${role} gestopt (code ${code}, signal ${signal}) — herstart in ${delay / 1000}s`
    );

    setTimeout(() => spawnWorker(role), delay);
  });

  // ---- Vang fouten bij het forken zelf op ----
  child.on('error', (err) => {
    console.error(`[supervisor] ${role} fork error:`, err.message);
  });
}

spawnWorker('keepalive');
spawnWorker('kiddo');

// ============================================
// EXPRESS API (blijft ALTIJD draaien)
// ============================================
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.get('/status', (req, res) => {
  const workerStatus = {};
  for (const role of Object.keys(workers)) {
    workerStatus[role] = workers[role] ? 'running' : 'restarting';
  }

  res.json({
    workers: workerStatus,
    restartCount,
    leaderboards: allLeaderboards,
  });
});

app.get('/aero/stats/all', (req, res) => res.json(allLeaderboards));
app.get('/aero/stats/diamond-smp', (req, res) => res.json(allLeaderboards['Diamond Smp']));
app.get('/aero/stats/sword', (req, res) => res.json(allLeaderboards['Sword']));
app.get('/aero/stats/mace', (req, res) => res.json(allLeaderboards['Mace']));
app.get('/aero/stats/crystal-pvp', (req, res) => res.json(allLeaderboards['Crystal PVP']));
app.get('/aero/stats/spear-mace', (req, res) => res.json(allLeaderboards['Spear Mace']));

app.listen(PORT, () => {
  console.log(`[HTTP] API Server draait op poort ${PORT}`);
  console.log(`[HTTP] Endpoints: /ping, /status, /aero/stats/*`);
});
