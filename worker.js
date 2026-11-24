// worker.js — draait één bot in een eigen proces
const mineflayer = require('mineflayer');

const role = process.argv[2]; // 'keepalive' of 'kiddo'

// === Crash-isolatie ===
process.on('uncaughtException', (err) => {
  console.error(`[${role}] uncaughtException:`, err.message);
  process.send?.({ type: 'crash', message: err.message });
  // Laat supervisor herstarten — NIET zelf doorgaan met corrupte state
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${role}] unhandledRejection:`, reason);
});

// === Config per rol ===
const CONFIG = {
  keepalive: {
    host: 'aero-pvp.play.hosting',
    port: 25565,
    username: 'KeepAliveBot',
    version: '1.21.1',
    hideInventory: true,
    password: '<passKeepAliveBot>',
  },
  kiddo: {
    host: 'theempiresmp.play.hosting',
    port: 25565,
    username: 'Thekiddo_Bot',
    version: '1.21.1',
    password: '<passKeepAliveBot>',
  },
};

const cfg = CONFIG[role];
if (!cfg) {
  console.error(`[worker] Onbekende rol: ${role}`);
  process.exit(1);
}

const KITS = ['Diamond Smp', 'Sword', 'Mace', 'Crystal PVP', 'Spear Mace'];
let currentKit = null;

const bot = mineflayer.createBot({
  host: cfg.host,
  port: cfg.port,
  username: cfg.username,
  version: cfg.version,
  hideInventory: cfg.hideInventory,
});

// === Physics uit: voorkomt invalid_player_movement kick ===
bot.once('spawn', async () => {
  console.log(`[${role}] ✅ Ingelogd en gespawned`);
  bot.physics.enabled = false;
  await new Promise((r) => setTimeout(r, 2000));

  if (role === 'keepalive') {
    bot.chat(`/login ${cfg.password}`);
    setTimeout(() => bot.chat(`/register ${cfg.password} ${cfg.password}`), 2000);
  } else {
    // Kiddo: eerst /login proberen, bij "not registered" pas /register
    bot.chat(`/login ${cfg.password}`);
    setTimeout(() => {
      if (!bot.authenticated) {
        bot.chat(`/register ${cfg.password} ${cfg.password}`);
      }
    }, 3000);
  }

  if (role === 'keepalive') startLeaderboardLoop();
});

// === Leaderboard-loop (alleen keepalive) ===
async function startLeaderboardLoop() {
  while (bot && bot.entity) {
    for (const kit of KITS) {
      currentKit = kit;
      bot.chat(`/duel top ${kit}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    currentKit = null;
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  }
}

// === Chat veilig parsen (met try/catch) ===
bot.on('message', (jsonMsg) => {
  if (!currentKit) return;
  let text;
  try {
    text = jsonMsg.toString();
  } catch (err) {
    console.warn(`[${role}] chat parse fout (genegeerd):`, err.message);
    return;
  }
  const match = text.trim().match(/^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i);
  if (!match) return;

  // Stuur resultaat naar supervisor via IPC
  process.send?.({
    type: 'leaderboard',
    kit: currentKit,
    player: match[2],
    rating: parseInt(match[3], 10),
  });
});

// === Verbindings-events ===
bot.on('kicked', (reason) => {
  console.log(`[${role}] ❌ Gekickt:`, JSON.stringify(reason).slice(0, 200));
  process.exit(1); // supervisor herstart
});
bot.on('error', (err) => {
  console.log(`[${role}] ⚠️ Error:`, err.message);
  process.exit(1);
});
bot.on('end', (reason) => {
  console.log(`[${role}] Verbinding verbroken (${reason})`);
  process.exit(1);
});
