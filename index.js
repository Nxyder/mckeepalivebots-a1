const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE BOT 1 (Solar_Bot) - Geen tracking
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

// ============================================
// 3. LOGICA VOOR BOT 1 (Alleen online blijven)
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
    setTimeout(startBot1, reconnectDelay1);
    reconnectDelay1 = Math.min(reconnectDelay1 * 2, 60000);
  });
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
    setTimeout(startBot2, reconnectDelay2);
    reconnectDelay2 = Math.min(reconnectDelay2 * 2, 60000);
  });
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

// Het root-endpoint (/) geeft nu live het aantal online spelers van Bot 2 terug als een text integer
app.get('/', (req, res) => {
  let liveCount = 0;

  if (bot2 && isBot2Online && bot2.players) {
    const livePlayers2 = Object.keys(bot2.players).filter(name => name !== bot2.username);
    liveCount = livePlayers2.length;
  }

  res.status(200).send(liveCount.toString());
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log(`[HTTP] Live speler count endpoint beschikbaar op: http://localhost:${PORT}/`);
});

// ============================================
// 6. START BEIDE BOTS APART
// ============================================
startBot1();
startBot2();
