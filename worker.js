// worker.js — draait één bot in een eigen proces
const mineflayer = require('mineflayer');
const {
  KITS,
  BOT_1,
  BOT_2,
  LEADERBOARD_REFRESH_MS,
  KIT_QUERY_DELAY_MS,
  AUTH_DELAY_MS,
  KEEPALIVE_INTERVAL_MS,
} = require('./config');

const role = process.argv[2]; // 'keepalive' of 'kiddo'

// ============================================
// CRASH-ISOLATIE — negeer bekende parse-fouten
// ============================================
let parseErrorCount = 0;

process.on('uncaughtException', (err) => {
  const msg = (err && err.message) || '';

  // Negeer bekende parse-fouten — bot blijft draaien
  if (
    msg.includes('unknown chat format code') ||
    msg.includes('PartialReadError') ||
    msg.includes('Read error for undefined') ||
    msg.includes('Invalid move player packet') ||
    msg.includes('timed out')
  ) {
    parseErrorCount++;
    console.warn(
      `[${role}] fout genegeerd (${parseErrorCount}x): ${msg.slice(0, 100)}`
    );
    return; // NIET process.exit(1) — bot blijft draaien
  }

  // Onbekende fout: afsluiten zodat supervisor herstart
  console.error(`[${role}] onverwachte crash:`, msg);
  process.send?.({ type: 'crash', message: msg });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${role}] unhandledRejection:`, reason);
});

// ============================================
// CONFIG PER ROL
// ============================================
const cfg = role === 'keepalive' ? BOT_1 : role === 'kiddo' ? BOT_2 : null;

if (!cfg) {
  console.error(`[worker] Onbekende rol: ${role}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================
// STATE
// ============================================
let currentKit = null;
let loopRunning = false;
let stopped = false;
let keepaliveTimer = null;

// ============================================
// BOT AANMAKEN
// ============================================
console.log(`[${role}] Verbinden met ${cfg.host}...`);

let bot;
try {
  bot = mineflayer.createBot({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    version: cfg.version,
    hideInventory: cfg.hideInventory,
    // BELANGRIJK: schakel Mineflayer's eigen keepalive-timeout uit.
    // We regelen keepalive zelf via de client.
    checkTimeoutInterval: 0,
  });
} catch (err) {
  console.error(`[${role}] ❌ Fout bij aanmaken bot:`, err.message);
  process.exit(1);
}

// ============================================
// EIGEN KEEPALIVE — voorkomt server-timeout
// ============================================
function startKeepalive() {
  if (keepaliveTimer) return;

  keepaliveTimer = setInterval(() => {
    if (stopped || !bot || !bot._client) return;

    try {
      // Stuur een keepalive-packet naar de server.
      // Dit houdt de verbinding actief, ook als de server zelf
      // geen keepalive stuurt.
      if (typeof bot._client.write === 'function') {
        bot._client.write('keep_alive', {
          keepAliveId: BigInt(Date.now()),
        });
      }
    } catch (err) {
      // Negeer fouten — de verbinding blijft gewoon bestaan
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

// ============================================
// SPAWN + AUTH + PHYSICS UIT
// ============================================
bot.once('spawn', async () => {
  console.log(`[${role}] ✅ Ingelogd en gespawned op ${cfg.host}`);

  // Physics volledig uit — voorkomt invalid_player_movement kick
  try {
    bot.physics.enabled = false;
  } catch (err) {
    console.warn(`[${role}] physics uitzetten faalde:`, err.message);
  }

  // Start eigen keepalive-loop
  startKeepalive();

  // Wacht tot server de spawn-positie bevestigt
  await sleep(AUTH_DELAY_MS);

  if (role === 'keepalive') {
    bot.chat(`/login ${cfg.password}`);
    await sleep(2000);
    bot.chat(`/register ${cfg.password} ${cfg.password}`);
  } else {
    bot.chat(`/login ${cfg.password}`);
    await sleep(3000);
  }

  if (role === 'keepalive') {
    startLeaderboardLoop();
  }
});

// ============================================
// LEADERBOARD-LOOP (alleen keepalive)
// ============================================
async function startLeaderboardLoop() {
  if (loopRunning) return;
  loopRunning = true;

  try {
    while (!stopped && bot && bot.entity) {
      console.log(`[${role}] 🔄 Leaderboards verversen...`);

      for (const kit of KITS) {
        if (stopped || !bot || !bot.entity) break;
        currentKit = kit;
        bot.chat(`/duel top ${kit}`);
        await sleep(KIT_QUERY_DELAY_MS);
      }

      currentKit = null;

      if (stopped || !bot || !bot.entity) break;

      console.log(
        `[${role}] ✅ Alle kits opgehaald. Wacht ${LEADERBOARD_REFRESH_MS / 60000} minuten...`
      );
      await sleep(LEADERBOARD_REFRESH_MS);
    }
  } finally {
    loopRunning = false;
    currentKit = null;
    console.log(`[${role}] Loop gestopt.`);
  }
}

// ============================================
// CHAT VEILIG PARSEN
// ============================================
bot._client.on('chat', (packet) => {
  if (role !== 'keepalive') return;
  if (!currentKit) return;

  try {
    const jsonMsg = packet.message;
    let text = '';

    if (typeof jsonMsg === 'string') {
      text = jsonMsg;
    } else if (jsonMsg && typeof jsonMsg === 'object') {
      const extract = (node) => {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(extract).join('');
        let out = '';
        if (node.text) out += node.text;
        if (node.extra) out += extract(node.extra);
        if (node.with) out += extract(node.with);
        return out;
      };
      text = extract(jsonMsg);
    }

    if (!text) return;

    const match = text.trim().match(/^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i);
    if (!match) return;

    const playerName = match[2];
    const playerRating = parseInt(match[3], 10);

    process.send?.({
      type: 'leaderboard',
      kit: currentKit,
      player: playerName,
      rating: playerRating,
    });
  } catch (err) {
    // Nooit crashen op een chat-packet
  }
});

// ============================================
// VERBINDINGS-EVENTS
// ============================================
bot.on('kicked', (reason) => {
  let reasonText;
  try {
    reasonText = JSON.stringify(reason).slice(0, 300);
  } catch {
    reasonText = String(reason).slice(0, 300);
  }
  console.log(`[${role}] ❌ Gekickt:`, reasonText);
  stopped = true;
  stopKeepalive();
  process.exit(1);
});

bot.on('error', (err) => {
  const msg = (err && err.message) || '';

  // Timeout = normale disconnect, geen crash
  if (msg.includes('timed out')) {
    console.log(`[${role}] ⏱️ Timeout — supervisor herstart...`);
    stopped = true;
    stopKeepalive();
    process.exit(1);
    return;
  }

  console.log(`[${role}] ⚠️ Error:`, msg);
  stopped = true;
  stopKeepalive();
  process.exit(1);
});

bot.on('end', (reason) => {
  console.log(`[${role}] Verbinding verbroken (${reason})`);
  stopped = true;
  stopKeepalive();
  process.exit(1);
});
