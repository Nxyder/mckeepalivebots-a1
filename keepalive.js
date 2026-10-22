const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE
// ============================================
const BOT_OPTIONS = {
  host: 'solar-smp.play.hosting',
  port: 25565,
  username: 'Solar_Bot',
  version: '1.21.1',
  // auth: 'microsoft', // Uncomment als het een premium account is
};

// VUL HIER JE WACHTWOORD IN
const BOT_PASSWORD = '<passKeepAlieBot>'; 

let bot;
let reconnectDelay = 5000;
let isBotOnline = false;

// Opslag voor spelersdata
const playerData = {
  currentlyOnline: new Set(),
  history: [], // Slaat alles op zolang de bot draait (tot Render herstart)
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

    setTimeout(() => {
      console.log('[KeepAliveBot] Auth commando sturen...');
      bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
      setTimeout(() => {
        bot.chat(`/login ${BOT_PASSWORD}`);
      }, 1000);
    }, 1000);
  });

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

  setInterval(() => {
    if (bot && bot.entity && isBotOnline) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
  }, 45000);
}

function logPlayerAction(username, action) {
  const record = {
    player: username,
    action: action,
    time: new Date().toISOString()
  };
  
  playerData.history.push(record);
  console.log(`[Tracking] ${username} ${action} de server.`);
}

// Hulpfunctie om statistieken te berekenen voor een specifieke periode
function calculateStats(daysBack) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  const stats = {};
  
  // Filter de history voor de specifieke periode
  const filteredHistory = playerData.history.filter(r => new Date(r.time) > cutoffDate);
  
  filteredHistory.forEach(record => {
    if (!stats[record.player]) {
      stats[record.player] = { totalJoins: 0, totalLeaves: 0, lastSeen: record.time };
    }
    if (record.action === 'joined') stats[record.player].totalJoins++;
    if (record.action === 'left') stats[record.player].totalLeaves++;
    
    if (new Date(record.time) > new Date(stats[record.player].lastSeen)) {
      stats[record.player].lastSeen = record.time;
    }
  });
  
  return { filteredHistory, stats };
}

// ============================================
// 3. HTTP SERVER
// ============================================
const app = express();

// Zet CORS open zodat je frontend (of andere websites) dit endpoint mag aanroepen
app.use(cors()); 

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
  // 1. Haal LIVE spelers op uit de bot
  let livePlayers = [];
  if (bot && isBotOnline && bot.players) {
    livePlayers = Object.keys(bot.players).filter(name => name !== bot.username);
  }

  // 2. Bereken de statistieken voor Week, Maand en All-Time
  const weeklyData = calculateStats(7);
  const monthlyData = calculateStats(30);
  // All-time is simpelweg alles wat in het history array staat
  const allTimeStats = {};
  playerData.history.forEach(record => {
    if (!allTimeStats[record.player]) {
      allTimeStats[record.player] = { totalJoins: 0, totalLeaves: 0, lastSeen: record.time };
    }
    if (record.action === 'joined') allTimeStats[record.player].totalJoins++;
    if (record.action === 'left') allTimeStats[record.player].totalLeaves++;
    
    if (new Date(record.time) > new Date(allTimeStats[record.player].lastSeen)) {
      allTimeStats[record.player].lastSeen = record.time;
    }
  });

  // 3. Stuur alles terug
  res.status(200).json({
    success: true,
    liveData: {
      onlineCount: livePlayers.length,
      onlinePlayers: livePlayers
    },
    history: {
      weekly: {
        stats: weeklyData.stats,
        rawEvents: weeklyData.filteredHistory
      },
      monthly: {
        stats: monthlyData.stats,
        rawEvents: monthlyData.filteredHistory
      },
      allTime: {
        stats: allTimeStats,
        rawEvents: playerData.history // Alles sinds de laatste server/bot restart
      }
    }
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
