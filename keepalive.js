const mineflayer = require('mineflayer');
const express = require('express');

// ============================================
// 1. MINECRAFT BOT CONFIGURATIE
// ============================================
const BOT_OPTIONS = {
  host: 'odneflora.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
};

let bot;
let reconnectDelay = 5000;
let isBotOnline = false;

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
    setTimeout(startBot, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  // Anti-AFK: kleine beweging elke 45s
  setInterval(() => {
    if (bot && bot.entity && isBotOnline) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
  }, 45000);
}

// ============================================
// 3. HTTP SERVER (voor Render + UptimeRobot)
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// Health endpoint — hier pingt UptimeRobot naartoe
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: isBotOnline ? 'online' : 'offline',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log('[HTTP] UptimeRobot kan nu pingen naar je Render URL');
});

// ============================================
// 4. START
// ============================================
startBot();
