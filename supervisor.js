// supervisor.js — herstart workers, houdt API draaiend
const { fork } = require('child_process');
const express = require('express');
const cors = require('cors');
const { KITS } = require('./config');

// ============================================
// GLOBALE CRASH-BEVEILIGING
// ============================================
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] uncaughtException:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] unhandledRejection:', reason);
});

// ============================================
// LEADERBOARD STATE (gedeeld met workers via IPC)
// ============================================
const allLeaderboards = {};
for (const kit of KITS) allLeaderboards[kit] = [];

// ============================================
// WORKER MANAGEMENT
// ============================================
const workers = {}; // role -> child

function spawnWorker(role) {
  console.log(`[supervisor] ${role} starten...`);

  const child = fork('./worker.js', [role], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  workers[role] = child;

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

  child.on('exit', (code, signal) => {
    console.log(`[supervisor] ${role} gestopt (code ${code}, signal ${signal}), herstart in 5s`);
    workers[role] = null;
    setTimeout(() => spawnWorker(role), 5000);
  });
}

spawnWorker('keepalive');
spawnWorker('kiddo');

// ============================================
// EXPRESS API (blijft altijd draaien)
// ============================================
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  // Live spelerscount — alleen beschikbaar als kiddo-worker draait
  // (voor nu: leeg, want worker-state zit in apart proces)
  res.status(200).send('0');
});

app.get('/status', (req, res) => {
  res.json({
    workers: {
      keepalive: workers.keepalive ? 'running' : 'restarting',
      kiddo: workers.kiddo ? 'running' : 'restarting',
    },
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
