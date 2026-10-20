const mineflayer = require('mineflayer');
const express = require('express');

// ============================================
// 1. CONFIGURATIE
// ============================================
const BOT_OPTIONS = {
  host: 'theempiresmp.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
  // auth: 'microsoft', // Uncomment als het een premium account is
};

// VUL HIER JE WACHTWOORD IN
const BOT_PASSWORD = '<passKeepAliveBot>'; 

let bot;
let reconnectDelay = 5000;
let isBotOnline = false;

// Opslag voor spelersdata
const playerData = {
  currentlyOnline: new Set(),
  history: [], // Slaat ALLES op, we filteren later op tijd
  retentionDays: 7 // Bewaar data maximaal 7 dagen om geheugen te sparen
};

// ============================================
// 2. BOT LOGICA
// ============================================
function startBot() {
  console.log('[KeepAliveBot] Verbinden met server...');

  bot = mineflayer.createBot(BOT_OPTIONS);

  bot.once('spawn', () => {
    console.log('[KeepAliveBot] ✅ Ingelogd en gespawned');
    isBotOnline = true;
    reconnectDelay = 5000;

    // Wacht 1 seconde na spawn voordat we auth commands sturen
    setTimeout(() => {
      console.log('[KeepAliveBot] Auth commando sturen...');
      bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
      setTimeout(() => {
        bot.chat(`/login ${BOT_PASSWORD}`);
      }, 1000);
    }, 1000);
  });

  // --- SPELER TRACKING EVENTS ---
  bot.on('playerJoined', (player) => {
    if (player.username !== bot.username) {
      playerData.currentlyOnline.add(player.username);
      logPlayerAction(player.username, 'joined');
    }
  });

  bot.on('playerLeft', (player) => {
    if (player.username !== bot.username) {
      playerData.currentlyOnline.delete(player.username);
      logPlayerAction(player.username, 'left');
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[KeepAliveBot] ❌ Gekickt:', reason);
    isBotOnline = false;
  });

  bot.on('error', (err) => {
    console.log('[KeepAliveBot] ⚠️ Error:', err.message);
    isBotOnline = false;
  });

  bot.on('end', (reason) => {
    console.log(`[KeepAliveBot] Disconnect (${reason}), reconnect in ${reconnectDelay / 1000}s`);
    isBotOnline = false;
    playerData.currentlyOnline.clear(); 
    setTimeout(startBot, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  // Anti-AFK: kleine beweging of chat elke 45s
  setInterval(() => {
    if (bot && bot.entity && isBotOnline) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
  }, 45000);
}

// Hulpfunctie voor het opslaan van de geschiedenis
function logPlayerAction(username, action) {
  const record = {
    player: username,
    action: action,
    time: new Date().toISOString()
  };
  
  playerData.history.push(record);
  console.log(`[Tracking] ${username} ${action} de server.`);
  
  // Verwijder events die ouder zijn dan de retentionDays (7 dagen)
  cleanupOldHistory();
}

function cleanupOldHistory() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - playerData.retentionDays);
  
  // Filter de array: behoud alleen records nieuwer dan cutoffDate
  playerData.history = playerData.history.filter(record => {
    return new Date(record.time) > cutoffDate;
  });
}

// ============================================
// 3. HTTP SERVER
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: isBotOnline ? 'online' : 'offline',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// --- HET VERBETERDE /PLAYERS ENDPOINT ---
app.get('/players', (req, res) => {
  // 1. Haal LIVE spelers op uit de bot (de tab-lijst op dit exacte moment)
  let livePlayers = [];
  if (bot && isBotOnline && bot.players) {
    livePlayers = Object.keys(bot.players).filter(name => name !== bot.username);
  }

  // 2. Groepeer de geschiedenis voor een mooi overzicht per speler
  const playerStats = {};
  
  playerData.history.forEach(record => {
    if (!playerStats[record.player]) {
      playerStats[record.player] = {
        totalJoins: 0,
        totalLeaves: 0,
        lastSeen: record.time
      };
    }
    
    if (record.action === 'joined') playerStats[record.player].totalJoins++;
    if (record.action === 'left') playerStats[record.player].totalLeaves++;
    
    // Update lastSeen naar de meest recente actie
    if (new Date(record.time) > new Date(playerStats[record.player].lastSeen)) {
      playerStats[record.player].lastSeen = record.time;
    }
  });

  // 3. Stuur alles terug
  res.status(200).json({
    success: true,
    liveData: {
      onlineCount: livePlayers.length,
      onlinePlayers: livePlayers
    },
    weeklyStats: playerStats,
    rawHistory: playerData.history // Optioneel: de complete lijst met join/leave events
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log(`[HTTP] Spelers data beschikbaar op: http://localhost:${PORT}/players`);
});

// ============================================
// 4. START
// ============================================
startBot();
