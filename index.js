const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 1. CONFIGURATIE BOT 1 (Solar_Bot) - Blijft continu online
// ============================================
const BOT_1_OPTIONS = {
  host: 'aero-pvp.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
};
const BOT_1_PASSWORD = '<passKeepAliveBot>';

let bot1 = null;
let isBot1Online = false;
let reconnectDelay1 = 5000;

// ============================================
// 2. CONFIGURATIE BOT 2 (Empire_Bot) - Periodiek joinen & leaven
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
let latestEmpirePlayers = []; // Slaat de meest recente spelerslijst tijdelijk op

// ============================================
// 3. LOGICA VOOR BOT 1 (Continu online)
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
// 4. LOGICA VOOR BOT 2 (Elke 2 minuten joinen, data ophalen, wegwezen)
// ============================================
function runEmpireBotCheck() {
  console.log(`[Empire_Bot] 🔄 Start periodieke check voor ${BOT_2_OPTIONS.host}...`);

  bot2 = mineflayer.createBot(BOT_2_OPTIONS);

  // Zorg dat als het verbinden mislukt, de app niet crasht
  bot2.on('error', (err) => {
    console.log('[Empire_Bot] ⚠️ Error:', err.message);
  });

  bot2.on('kicked', (reason) => {
    console.log('[Empire_Bot] ❌ Gekickt:', reason);
  });

  bot2.once('spawn', () => {
    console.log('[Empire_Bot] ✅ Ingelogd en gespawned');
    isBot2Online = true;

    // Login commando's versturen indien nodig
    if (BOT_2_PASSWORD) {
      setTimeout(() => {
        bot2.chat(`/register ${BOT_2_PASSWORD} ${BOT_2_PASSWORD}`);
        setTimeout(() => {
          bot2.chat(`/login ${BOT_2_PASSWORD}`);
        }, 1000);
      }, 1000);
    }

    // Geef de server even de tijd om de spelerslijst door te sturen naar de bot (na 3 seconden)
    setTimeout(() => {
      if (bot2 && bot2.players) {
        const livePlayers2 = Object.keys(bot2.players).filter(name => name !== bot2.username);
        latestEmpirePlayers = livePlayers2;
        console.log(`[Empire_Bot] 📊 Spelerdata opgehaald: ${livePlayers2.length} spelers gevonden.`);
      }

      // Sluit de verbinding direct weer af nadat de data binnen is
      console.log('[Empire_Bot] 👋 Klaar, bot verlaat de server weer...');
      isBot2Online = false;
      try {
        bot2.quit();
      } catch (e) {
        // Negeer eventuele fouten bij het afsluiten
      }
    }, 4000); // 4 seconden na spawn data pakken en wegwezen
  });

  bot2.on('end', (reason) => {
    isBot2Online = false;
    console.log(`[Empire_Bot] Verbinding verbroken (${reason}).`);
  });
}

// Start direct de eerste check voor Empire Bot, en herhaal dit daarna elke 2 minuten (120.000 ms)
runEmpireBotCheck();
setInterval(runEmpireBotCheck, 120 * 1000);

// ============================================
// 5. HTTP SERVER
// ============================================
const app = express();
app.use(cors()); 

const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Het root-endpoint (/) geeft de speler count terug
app.get('/', (req, res) => {
  let liveCount = 0;

  // Als Empire Bot net actief is geweest, pak die data. Anders fallback naar Bot 1 of 0.
  if (latestEmpirePlayers.length > 0) {
    liveCount = latestEmpirePlayers.length;
  } else if (bot1 && isBot1Online && bot1.players) {
    const livePlayers1 = Object.keys(bot1.players).filter(name => name !== bot1.username);
    liveCount = livePlayers1.length;
  }

  res.status(200).send(liveCount.toString());
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server draait op poort ${PORT}`);
  console.log(`[HTTP] Live speler count endpoint beschikbaar op: http://localhost:${PORT}/`);
});

// ============================================
// 6. START BOT 1
// ============================================
startBot1();
