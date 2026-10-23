const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE BOT 1 (Solar_Bot)
// ============================================
const BOT_1_OPTIONS = {
  host: 'solar-smp.play.hosting',
  port: 25565,
  username: 'Solar_Bot',
  version: '1.21.1',
};
const BOT_1_PASSWORD = '<passKeepAliveBot>';

let bot1 = null;
let isBot1Online = false;
let reconnectDelay1 = 5000;

const bot1PlayerData = {
  currentlyOnline: new Set(),
  history: [],
};

// ============================================
// 2. CONFIGURATIE BOT 2 (Empire_Bot)
// ============================================
const BOT_2_OPTIONS = {
  host: 'theempiresmp.play.hosting',
  port: 25565,
  username: 'The_Empire_Bot',
  version: '1.21.1',
};
const BOT_2_PASSWORD = '<passKeepAliveBot>';

let bot2 = null;
let isBot2Online = false;
let reconnectDelay2 = 5000;

const bot2PlayerData = {
  currentlyOnline: new Set(),
  history: [],
};

// ============================================
// 3. LOGICA VOOR BOT 1
// ============================================
function startBot1() {
  console.log(`[Solar_Bot] Verbinden met ${BOT_1_OPTIONS.host}...`);

  bot1 = mineflayer.createBot(BOT_1_OPTIONS);

  bot1.once('spawn', () => {
    console.log('[Solar_Bot] ✅ Ingelogd en gespawned');
    isBot1Online = true;
    reconnectDelay1 = 5000;

    if (BOT_1_PASSWORD) {
      setTimeout(() => {
        console.log('[Solar_Bot] Auth commando sturen...');
        bot1.chat(`/register ${BOT_1_PASSWORD} ${BOT_1_PASSWORD}`);
        setTimeout(() => {
          bot1.chat(`/login ${BOT_1_PASSWORD}`);
        }, 1000);
      }, 1000);
    }
  });

  bot1.on('playerJoined', (player) => {
    if (player.username !== bot1.username) {
      bot1PlayerData.currentlyOnline.add(player.username);
      logPlayerAction1(player.username, 'joined');
    }
  });

  bot1.on('playerLeft', (player) => {
    if (player.username !== bot1.username) {
      bot1PlayerData.currentlyOnline.delete(player.username);
      logPlayerAction1(player.username, 'left');
    }
  });

  bot1.on('kicked', (reason) => {
    console.log('[Solar_Bot] ❌ Gekickt:', reason);
    isBot1Online = false;
  });

  bot1.on('error', (err) => {
    console.log('[Solar_Bot] ⚠️ Error:', err.message);
    isBot1Online = false;
  });

  bot1.on('end', (reason) => {
    console.log(`[Solar_Bot] Disconnect (${reason}), reconnect in ${reconnectDelay1 / 1000}s`);
    isBot1Online = false;
    bot1PlayerData.currentlyOnline.clear(); 
    setTimeout(startBot1, reconnectDelay1);
    reconnectDelay1 = Math.min(reconnectDelay1 * 2, 60000);
  });
}

function logPlayerAction1(username, action) {
  const record = {
    player: username,
    action: action,
    time: new Date().toISOString()
  };
  bot1PlayerData.history.push(record);
  console.log(`[Tracking][Solar_Bot] ${username} ${action} de server.`);
}

// ============================================
// 4. LOGICA VOOR BOT 2
// ============================================
function startBot2() {
  console.log(`[Empire_Bot] Verbinden met ${BOT_2_OPTIONS.host}...`);

  bot2 = mineflayer.createBot(BOT_2_OPTIONS);

  bot2.once('spawn', () => {
    console.log('[Empire_Bot] ✅ Ingelogd en gespawned');
    isBot2Online = true;
    reconnectDelay2 = 5000;

    if (BOT_2_PASSWORD) {
      setTimeout(() => {
        console.log('[Empire_Bot] Auth commando sturen...');
        bot2.chat(`/register ${BOT_2_PASSWORD} ${BOT_2_PASSWORD}`);
        setTimeout(() => {
          bot2.chat(`/login ${BOT_2_PASSWORD}`);
        }, 1000);
      }, 1000);
    }
  });

  bot2.on('playerJoined', (player) => {
    if (player.username !== bot2.username) {
      bot2PlayerData.currentlyOnline.add(player.username);
      logPlayerAction2(player.username, 'joined');
    }
  });

  bot2.on('playerLeft', (player) => {
    if (player.username !== bot2.username) {
      bot2PlayerData.currentlyOnline.delete(player.username);
      logPlayerAction2(player.username, 'left');
    }
  });

  bot2.on('kicked', (reason) => {
    console.log('[Empire_Bot] ❌ Gekickt:', reason);
    isBot2Online = false;
  });

  bot2.on('error', (err) => {
    console.log('[Empire_Bot] ⚠️ Error:', err.message);
    isBot2Online = false;
  });

  bot2.on('end', (reason) => {
    console.log(`[Empire_Bot] Disconnect (${reason}), reconnect in ${reconnectDelay2 / 1000}s`);
    isBot2Online = false;
    bot2PlayerData.currentlyOnline.clear(); 
    setTimeout(startBot2, reconnectDelay2);
    reconnectDelay2 = Math.min(reconnectDelay2 * 2, 60000);
  });
}

function logPlayerAction2(username, action) {
  const record = {
    player: username,
    action: action,
    time: new Date().toISOString()
  };
  bot2PlayerData.history.push(record);
  console.log(`[Tracking][Empire_Bot] ${username} ${action} de server.`);
}

// Algemene hulpfunctie voor statistieken
function calculateStats(historyArray, daysBack) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  const stats = {};
  const filteredHistory = historyArray.filter(r => new Date(r.time) > cutoffDate);
  
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
// 5. HTTP SERVER
// ============================================
const app = express();
app.use(cors()); 

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bots: {
      Solar_Bot: {
        host: BOT_1_OPTIONS.host,
        bot: isBot1Online ? 'online' : 'offline'
      },
      Empire_Bot: {
        host: BOT_2_OPTIONS.host,
        bot: isBot2Online ? 'online' : 'offline'
      }
    }
  });
});

app.get('/players', (req, res) => {
  // --- Bot 1 Data ---
  let livePlayers1 = [];
  if (bot1 && isBot1Online && bot1.players) {
    livePlayers1 = Object.keys(bot1.players).filter(name => name !== bot1.username);
  }
  const weeklyData1 = calculateStats(bot1PlayerData.history, 7);
  const monthlyData1 = calculateStats(bot1PlayerData.history, 30);
  const allTimeStats1 = {};
  bot1PlayerData.history.forEach(record => {
    if (!allTimeStats1[record.player]) {
      allTimeStats1[record.player] = { totalJoins: 0, totalLeaves: 0, lastSeen: record.time };
    }
    if (record.action === 'joined') allTimeStats1[record.player].totalJoins++;
    if (record.action === 'left') allTimeStats1[record.player].totalLeaves++;
    if (new Date(record.time) > new Date(allTimeStats1[record.player].lastSeen)) {
      allTimeStats1[record.player].lastSeen = record.time;
    }
  });

  // --- Bot 2 Data ---
  let livePlayers2 = [];
  if (bot2 && isBot2Online && bot2.players) {
    livePlayers2 = Object.keys(bot2.players).filter(name => name !== bot2.username);
  }
  const weeklyData2 = calculateStats(bot2PlayerData.history, 7);
  const monthlyData2 = calculateStats(bot2PlayerData.history, 30);
  const allTimeStats2 = {};
  bot2PlayerData.history.forEach(record => {
    if (!allTimeStats2[record.player]) {
      allTimeStats2[record.player] = { totalJoins: 0, totalLeaves: 0, lastSeen: record.time };
    }
    if (record.action === 'joined') allTimeStats2[record.player].totalJoins++;
    if (record.action === 'left') allTimeStats2[record.player].totalLeaves++;
    if (new Date(record.time) > new Date(allTimeStats2[record.player].lastSeen)) {
      allTimeStats2[record.player].lastSeen = record.time;
    }
  });

  res.status(200).json({
    success: true,
    bots: {
      Solar_Bot: {
        server: BOT_1_OPTIONS.host,
        liveData: {
          onlineCount: livePlayers1.length,
          onlinePlayers: livePlayers1
        },
        history: {
          weekly: { stats: weeklyData1.stats, rawEvents: weeklyData1.filteredHistory },
          monthly: { stats: monthlyData1.stats, rawEvents: monthlyData1.filteredHistory },
          allTime: { stats: allTimeStats1, rawEvents: bot1PlayerData.history }
        }
      },
      Empire_Bot: {
        server: BOT_2_OPTIONS.host,
        liveData: {
          onlineCount: livePlayers2.length,
          onlinePlayers: livePlayers2
        },
        history: {
          weekly: { stats: weeklyData2.stats, rawEvents: weeklyData2.filteredHistory },
          monthly: { stats: monthlyData2.stats, rawEvents: monthlyData2.filteredHistory },
          allTime: { stats: allTimeStats2, rawEvents: bot2PlayerData.history }
        }
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log(`[HTTP] Alle bots data beschikbaar op: http://localhost:${PORT}/players`);
});

// ============================================
// 6. START BEIDE BOTS APART
// ============================================
startBot1();
startBot2();
