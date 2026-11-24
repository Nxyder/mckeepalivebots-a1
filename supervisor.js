// supervisor.js — herstart workers, houdt API draaiend
const { fork } = require('child_process');

const allLeaderboards = {
  'Diamond Smp': [], 'Sword': [], 'Mace': [], 'Crystal PVP': [], 'Spear Mace': [],
};

function spawnWorker(role) {
  const child = fork('./worker.js', [role]);

  child.on('message', (msg) => {
    if (msg.type === 'leaderboard') {
      const list = allLeaderboards[msg.kit];
      const idx = list.findIndex((p) => p.player === msg.player);
      const obj = { player: msg.player, rating: msg.rating };
      if (idx !== -1) list[idx] = obj; else list.push(obj);
    }
  });

  child.on('exit', (code) => {
    console.log(`[supervisor] ${role} gestopt (code ${code}), herstart in 5s`);
    setTimeout(() => spawnWorker(role), 5000);
  });
}

spawnWorker('keepalive');
spawnWorker('kiddo');

// === API (blijft altijd draaien, ook als een bot crasht) ===
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => res.status(200).send('OK'));
app.get('/status', (req, res) => res.json({ leaderboards: allLeaderboards }));
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
