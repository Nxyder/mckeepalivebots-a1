const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE BOT 1 (KeepAliveBot - Aero PVP)
// ============================================
const BOT_1_OPTIONS = {
  host: 'aero-pvp.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
  hideInventory: true,
};
const BOT_1_PASSWORD = '<passKeepAliveBot>';

const KITS = [
  'Diamond Smp',
  'Sword',
  'Mace',
  'Crystal PVP',
  'Spear Mace'
];

let currentKit = null;
let allLeaderboards = {
  'Diamond Smp': [],
  'Sword': [],
  'Mace': [],
  'Crystal PVP': [],
  'Spear Mace': []
};

// ============================================
// 2. CONFIGURATIE BOT 2 (TheKiddoBot - The Empire SMP)
// ============================================
const BOT_2_OPTIONS = {
  host: 'theempiresmp.play.hosting',
  port: 25565,
  username: 'Thekiddo_Bot',
  version: '1.21.1',
};
const BOT_2_PASSWORD = '<passKeepAliveBot>';

let bot2 = null;
let isBot2Online = false;
let reconnectDelay2 = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// 3. LOGICA VOOR BOT 1 (Aero PVP & Leaderboards)
// ============================================
function startBot1() {
  const bot1 = mineflayer.createBot(BOT_1_OPTIONS);

  bot1.once('spawn', async () => {
    console.log('[KeepAliveBot] ✅ Ingelogd en gespawned op Aero PVP.');

    // Wacht tot de server klaar is met de login-procedure
    await sleep(2000);
    bot1.chat(`/register ${BOT_1_PASSWORD} ${BOT_1_PASSWORD}`);

    await sleep(2000);
    bot1.chat(`/login ${BOT_1_PASSWORD}`);

    // Extra wachttijd zodat de server de login kan verwerken
    await sleep(3000);

    // Oneindige loop: haal alle kits op, wacht 5 minuten, herhaal
    while (true) {
      console.log('[KeepAliveBot] 🔄 Leaderboards verversen...');

      // Belangrijk: leeg de leaderboards zodat we geen oude data behouden
      for (const kit of KITS) {
        allLeaderboards[kit] = [];
      }

      for (const kit of KITS) {
        currentKit = kit;
        bot1.chat(`/duel top ${kit}`);
        // Iets langere wachttijd zodat alle chatregels kunnen binnenkomen
        await sleep(3000);
      }
      currentKit = null;

      console.log('[KeepAliveBot] ✅ Alle kits opgehaald. Wacht 5 minuten voor de volgende update...');
      await sleep(5 * 60 * 1000);
    }
  });

  bot1.on('messagestr', (message) => {
    if (!currentKit) return;

    // Regex voor het formaat: #1 • Speler - 1234 rating
    const regex = /^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i;
    const match = message.trim().match(regex);

    if (match) {
      const playerName = match[2];
      const playerRating = parseInt(match[3], 10);

      const existingIndex = allLeaderboards[currentKit].findIndex(
        (p) => p.player === playerName
      );

      const playerObj = {
        player: playerName,
        rating: playerRating
      };

      if (existingIndex !== -1) {
        allLeaderboards[currentKit][existingIndex] = playerObj;
      } else {
        allLeaderboards[currentKit].push(playerObj);
      }
    }
  });

  bot1.on('kicked', (reason) => {
    console.log('[KeepAliveBot] ❌ Gekickt:', reason);
    setTimeout(startBot1, 10000);
  });

  bot1.on('error', (err) => {
    console.log('[KeepAliveBot] ⚠️ Error:', err.message);
  });

  bot1.on('end', (reason) => {
    console.log(`[KeepAliveBot] Verbinding verbroken (${reason}), herstart over 10s...`);
    setTimeout(startBot1, 10000);
  });
}

// ============================================
// 4. LOGICA VOOR BOT 2 (TheKiddoBot - Empire SMP)
// ============================================
function startBot2() {
  console.log(`[TheKiddoBot] Verbinden met ${BOT_2_OPTIONS.host}...`);

  bot2 = mineflayer.createBot(BOT_2_OPTIONS);

  bot2.once('spawn', () => {
    console.log('[TheKiddoBot] ✅ Ingelogd en gespawned');
    isBot2Online = true;
    reconnectDelay2 = 5000;

    if (BOT_2_PASSWORD) {
      setTimeout(() => {
        console.log('[TheKiddoBot] Auth commando sturen...');
        bot2.chat(`/register ${BOT_2_PASSWORD} ${BOT_2_PASSWORD}`);
        setTimeout(() => {
          bot2.chat(`/login ${BOT_2_PASSWORD}`);
        }, 1000);
      }, 1000);
    }
  });

  bot2.on('kicked', (reason) => {
    console.log('[TheKiddoBot] ❌ Gekickt:', reason);
    isBot2Online = false;
  });

  bot2.on('error', (err) => {
    console.log('[TheKiddoBot] ⚠️ Error:', err.message);
    isBot2Online = false;
  });

  bot2.on('end', (reason) => {
    console.log(`[TheKiddoBot] Disconnect (${reason}), reconnect in ${reconnectDelay2 / 1000}s`);
    isBot2Online = false;
    setTimeout(startBot2, reconnectDelay2);
    reconnectDelay2 = Math.min(reconnectDelay2 * 2, 60000);
  });
}

// ============================================
// 5. EXPRESS API SERVER
// ============================================
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Root-endpoint (/) geeft live het aantal online spelers van TheKiddoBot terug
app.get('/', (req, res) => {
  let liveCount = 0;

  if (bot2 && isBot2Online && bot2.players) {
    const livePlayers2 = Object.keys(bot2.players).filter(
      (name) => name !== bot2.username
    );
    liveCount = livePlayers2.length;
  }

  res.status(200).send(liveCount.toString());
});

// Endpoints voor de leaderboards van Aero PVP
app.get('/aero/stats/all', (req, res) => {
  res.status(200).json(allLeaderboards);
});

app.get('/aero/stats/diamond-smp', (req, res) => {
  res.status(200).json(allLeaderboards['Diamond Smp'] || []);
});

app.get('/aero/stats/sword', (req, res) => {
  res.status(200).json(allLeaderboards['Sword'] || []);
});

app.get('/aero/stats/mace', (req, res) => {
  res.status(200).json(allLeaderboards['Mace'] || []);
});

app.get('/aero/stats/crystal-pvp', (req, res) => {
  res.status(200).json(allLeaderboards['Crystal PVP'] || []);
});

app.get('/aero/stats/spear-mace', (req, res) => {
  res.status(200).json(allLeaderboards['Spear Mace'] || []);
});

app.listen(PORT, () => {
  console.log(`[HTTP] API Server draait op poort ${PORT}`);
  console.log(`[HTTP] Beschikbare endpoints:`);
  console.log(`  - http://localhost:${PORT}/ (Empire Bot speler count)`);
  console.log(`  - http://localhost:${PORT}/aero/stats/all`);
  console.log(`  - http://localhost:${PORT}/aero/stats/crystal-pvp`);
  console.log(`  - http://localhost:${PORT}/aero/stats/diamond-smp`);
  console.log(`  - http://localhost:${PORT}/aero/stats/sword`);
  console.log(`  - http://localhost:${PORT}/aero/stats/mace`);
  console.log(`  - http://localhost:${PORT}/aero/stats/spear-mace`);
});

// ============================================
// 6. START BEIDE BOTS
// ============================================
startBot1();
startBot2();
