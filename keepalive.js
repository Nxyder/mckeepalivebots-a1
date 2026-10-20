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
  // Voeg hier eventueel auth: 'microsoft' toe als het een premium account is
};

// VUL HIER JE WACHTWOORD IN
const BOT_PASSWORD = '<passKeepAliveBot>'; 

let bot;
let reconnectDelay = 5000;
let isBotOnline = false;

// Opslag voor spelersdata (Efficient: alleen huidige online + history array)
const playerData = {
  currentlyOnline: new Set(), // Set is sneller en voorkomt duplicaten
  history: [], // Array met { player, action, time }
  maxHistoryLength: 100 // Voorkomt dat geheugen volloopt
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
      // We sturen zowel register als login. 
      // Meestal pakt de server degene die nodig is (als je al geregistreerd bent, faalt register en werkt login).
      bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
      setTimeout(() => {
        bot.chat(`/login ${BOT_PASSWORD}`);
      }, 1000); // 1 seconde later proberen in te loggen
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
    playerData.currentlyOnline.clear(); // Reset bij disconnect
    setTimeout(startBot, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  // Anti-AFK: kleine beweging of chat elke 45s
  setInterval(() => {
    if (bot && bot.entity && isBotOnline) {
      // Soms is springen niet genoeg tegen AFK plugins, chat is veiliger
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
  
  // Houd de history array kort (bijv. laatste 100 events)
  if (playerData.history.length > playerData.maxHistoryLength) {
    playerData.history.shift(); 
  }
  console.log(`[Tracking] ${username} ${action} de server.`);
}

// ============================================
// 3. HTTP SERVER (voor Render + UptimeRobot)
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// Simpele ping — geeft altijd 200 OK terug
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Bestaande health endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: isBotOnline ? 'online' : 'offline',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// NIEUW: Endpoint voor spelersdata
app.get('/players', (req, res) => {
  res.status(200).json({
    onlineCount: playerData.currentlyOnline.size,
    onlinePlayers: Array.from(playerData.currentlyOnline), // Zet Set om naar Array voor JSON
    recentHistory: playerData.history
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
