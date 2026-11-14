const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// CONFIGURATIE
// ============================================
const BOT_OPTIONS = {
  host: 'aero-pvp.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
  hideInventory: true, // Lost de protodef PartialReadError op voor 1.21.1 items
};

const PASSWORD = '<passKeepAliveBot>'; // Vervang dit met je echte wachtwoord

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// BOT STARTEN & LEADERBOARD SCRAPER LOGICA
// ============================================
function startBot() {
  const bot = mineflayer.createBot(BOT_OPTIONS);

  bot.once('spawn', async () => {
    console.log('[Aero_Bot] ✅ Ingelogd en gespawned op de server.');

    await sleep(1500);
    bot.chat(`/register ${PASSWORD} ${PASSWORD}`);

    await sleep(1500);
    bot.chat(`/login ${PASSWORD}`);

    await sleep(2000);

    // Loop continu door de kits om de data up-to-date te houden
    while (true) {
      for (const kit of KITS) {
        currentKit = kit;
        bot.chat(`/duel top ${kit}`);
        await sleep(2500); // Wacht tot de chat binnenkomt
      }
      currentKit = null;
      
      console.log('[Aero_Bot] ⏳ Alle kits opgehaald. Wacht 5 minuten voor de volgende update...');
      await sleep(5 * 60 * 1000);
    }
  });

  bot.on('messagestr', (message) => {
    if (currentKit) {
      const regex = /^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i;
      const match = message.trim().match(regex);

      if (match) {
        const playerName = match[2];
        const playerRating = parseInt(match[3], 10);

        const existingIndex = allLeaderboards[currentKit].findIndex(p => p.player === playerName);
        
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
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[Aero_Bot] ❌ Gekickt:', reason);
    setTimeout(startBot, 10000);
  });

  bot.on('error', (err) => {
    console.log('[Aero_Bot] ⚠️ Error:', err.message);
  });

  bot.on('end', (reason) => {
    console.log(`[Aero_Bot] Verbinding verbroken (${reason}), herstart over 10s...`);
    setTimeout(startBot, 10000);
  });
}

// Start de bot in de achtergrond
startBot();

// ============================================
// EXPRESS API SERVER
// ============================================
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Endpoint voor alle kits tegelijk
app.get('/aero/stats/all', (req, res) => {
  res.status(200).json(allLeaderboards);
});

// Individuele endpoints per kit
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
  console.log(`  - http://localhost:${PORT}/aero/stats/all`);
  console.log(`  - http://localhost:${PORT}/aero/stats/diamond-smp`);
  console.log(`  - http://localhost:${PORT}/aero/stats/sword`);
  console.log(`  - http://localhost:${PORT}/aero/stats/mace`);
  console.log(`  - http://localhost:${PORT}/aero/stats/crystal-pvp`);
  console.log(`  - http://localhost:${PORT}/aero/stats/spear-mace`);
});
