const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE (Meerdere bots via een array)
// ============================================
const BOTS_CONFIG = [
  {
    name: 'Solar_Bot',
    options: {
      host: 'solar-smp.play.hosting',
      port: 25565,
      username: 'Solar_Bot',
      version: '1.21.1',
    },
    password: '<passKeepAliveBot1>'
  },
  {
    name: 'Empire_Bot',
    options: {
      host: 'theempiresmp.play.hosting',
      port: 25565,
      username: 'Empire_Bot',
      version: '1.21.1',
    },
    password: '<passKeepAliveBot2>'
  }
];

// Object om per bot de status en data bij te houden
const botsData = {};

// Initialiseer de data-structuur per bot op basis van de config
BOTS_CONFIG.forEach(config => {
  botsData[config.name] = {
    botInstance: null,
    isOnline: false,
    reconnectDelay: 5000,
    playerData: {
      currentlyOnline: new Set(),
      history: [],
    }
  };
});

// ============================================
// 2. BOT LOGICA
// ============================================
function startBot(config) {
  const botName = config.name;
  const botData = botsData[botName];

  console.log(`[${botName}] Verbinden met ${config.options.host}...`);

  botData.botInstance = mineflayer.createBot(config.options);
  const bot = botData.botInstance;

  bot.once('spawn', () => {
    console.log(`[${botName}] ✅ Ingelogd en gespawned`);
    botData.isOnline = true;
    botData.reconnectDelay = 5000;

    if (config.password) {
      setTimeout(() => {
        console.log(`[${botName}] Auth commando sturen...`);
        bot.chat(`/register ${config.password} ${config.password}`);
        setTimeout(() => {
          bot.chat(`/login ${config.password}`);
        }, 1000);
      }, 1000);
    }
  });

  bot.on('playerJoined', (player) => {
    if (player.username !== bot.username) {
      botData.playerData.currentlyOnline.add(player.username);
      logPlayerAction(botName, player.username, 'joined');
    }
  });

  bot.on('playerLeft', (player) => {
    if (player.username !== bot.username) {
      botData.playerData.currentlyOnline.delete(player.username);
      logPlayerAction(botName, player.username, 'left');
    }
  });

  bot.on('kicked', (reason) => {
    console.log(`[${botName}] ❌ Gekickt:`, reason);
    botData.isOnline = false;
  });

  bot.on('error', (err) => {
    console.log(`[${botName}] ⚠️ Error:`, err.message);
    botData.isOnline = false;
  });

  bot.on('end', (reason) => {
    console.log(`[${botName}] Disconnect (${reason}), reconnect in ${botData.reconnectDelay / 1000}s`);
    botData.isOnline = false;
    botData.playerData.currentlyOnline.clear(); 
    setTimeout(() => startBot(config), botData.reconnectDelay);
    botData.reconnectDelay = Math.min(botData.reconnectDelay * 2, 60000);
  });
}

function logPlayerAction(botName, username, action) {
  const record = {
    player: username,
    action: action,
    time: new Date().toISOString()
  };
  
  botsData[botName].playerData.history.push(record);
  console.log(`[Tracking][${botName}] ${username} ${action} de server.`);
}

// Hulpfunctie om statistieken te berekenen voor een specifieke bot en periode
function calculateStats(botName, daysBack) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  const stats = {};
  const history = botsData[botName].playerData.history;
  const filteredHistory = history.filter(r => new Date(r.time) > cutoffDate);
  
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
app.use(cors()); 

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  const statusOverview = {};
  BOTS_CONFIG.forEach(config => {
    const data = botsData[config.name];
    statusOverview[config.name] = {
      host: config.options.host,
      bot: data.isOnline ? 'online' : 'offline'
    };
  });

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bots: statusOverview
  });
});

// --- UPDATED /PLAYERS ENDPOINT VOOR ALLE BOTS ---
app.get('/players', (req, res) => {
  const responseData = {};

  BOTS_CONFIG.forEach(config => {
    const botName = config.name;
    const data = botsData[botName];
    const bot = data.botInstance;

    // 1. Haal LIVE spelers op uit de bot
    let livePlayers = [];
    if (bot && data.isOnline && bot.players) {
      livePlayers = Object.keys(bot.players).filter(name => name !== bot.username);
    }

    // 2. Bereken statistieken
    const weeklyData = calculateStats(botName, 7);
    const monthlyData = calculateStats(botName, 30);
    
    const allTimeStats = {};
    data.playerData.history.forEach(record => {
      if (!allTimeStats[record.player]) {
        allTimeStats[record.player] = { totalJoins: 0, totalLeaves: 0, lastSeen: record.time };
      }
      if (record.action === 'joined') allTimeStats[record.player].totalJoins++;
      if (record.action === 'left') allTimeStats[record.player].totalLeaves++;
      
      if (new Date(record.time) > new Date(allTimeStats[record.player].lastSeen)) {
        allTimeStats[record.player].lastSeen = record.time;
      }
    });

    responseData[botName] = {
      server: config.options.host,
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
          rawEvents: data.playerData.history
        }
      }
    };
  });

  res.status(200).json({
    success: true,
    bots: responseData
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log(`[HTTP] Alle bots data beschikbaar op: http://localhost:${PORT}/players`);
});

// ============================================
// 4. START ALLE BOTS
// ============================================
BOTS_CONFIG.forEach(config => {
  startBot(config);
});
