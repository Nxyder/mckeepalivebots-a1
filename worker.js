// worker.js — draait één bot in een eigen proces
const mineflayer = require('mineflayer');
const { KITS, BOT_1, BOT_2, LEADERBOARD_REFRESH_MS, KIT_QUERY_DELAY_MS, AUTH_DELAY_MS } = require('./config');

const role = process.argv[2]; // 'keepalive' of 'kiddo'

// ============================================
// CRASH-ISOLATIE
// ============================================
process.on('uncaughtException', (err) => {
  console.error(`[${role}] uncaughtException:`, err.message);
  process.send?.({ type: 'crash', message: err.message });
  process.exit(1); // supervisor herstart deze worker
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

let currentKit = null;
let loopRunning = false;
let stopped = false;

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
  });
} catch (err) {
  console.error(`[${role}] ❌ Fout bij aanmaken bot:`, err.message);
  process.exit(1);
}

// ============================================
// SPAWN + AUTH
// ============================================
bot.once('spawn', async () => {
  console.log(`[${role}] ✅ Ingelogd en gespawned op ${cfg.host}`);

  // Physics uit: voorkomt invalid_player_movement kick
  bot.physics.enabled = false;

  // Wacht tot server positie bevestigd heeft
  await sleep(AUTH_DELAY_MS);

  if (role === 'keepalive') {
    bot.chat(`/login ${cfg.password}`);
    await sleep(2000);
    bot.chat(`/register ${cfg.password} ${cfg.password}`);
  } else {
    // Kiddo: eerst /login proberen, bij "not registered" pas /register
    bot.chat(`/login ${cfg.password}`);
    await sleep(3000);
    if (!bot.authenticated) {
      bot.chat(`/register ${cfg.password} ${cfg.password}`);
    }
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
      console.log(`[${role}] ✅ Alle kits opgehaald. Wacht ${LEADERBOARD_REFRESH_MS / 60000} minuten...`);
      await sleep(LEADERBOARD_REFRESH_MS);
    }
  } finally {
    loopRunning = false;
    currentKit = null;
    console.log(`[${role}] Loop gestopt.`);
  }
}

// ============================================
// CHAT VEILIG PARSEN (met try/catch)
// ============================================
bot.on('message', (jsonMsg) => {
  if (!currentKit) return;
  if (!bot || !bot.entity) return;

  let text;
  try {
    text = jsonMsg.toString();
  } catch (err) {
    console.warn(`[${role}] chat parse fout (genegeerd):`, err.message);
    return;
  }

  const match = text.trim().match(/^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i);
  if (!match) return;

  const playerName = match[2];
  const playerRating = parseInt(match[3], 10);

  // Stuur resultaat naar supervisor via IPC
  process.send?.({
    type: 'leaderboard',
    kit: currentKit,
    player: playerName,
    rating: playerRating,
  });
});

// ============================================
// VERBINDINGS-EVENTS
// ============================================
bot.on('kicked', (reason) => {
  console.log(`[${role}] ❌ Gekickt:`, JSON.stringify(reason).slice(0, 300));
  stopped = true;
  process.exit(1);
});

bot.on('error', (err) => {
  console.log(`[${role}] ⚠️ Error:`, err.message);
  stopped = true;
  process.exit(1);
});

bot.on('end', (reason) => {
  console.log(`[${role}] Verbinding verbroken (${reason})`);
  stopped = true;
  process.exit(1);
});
