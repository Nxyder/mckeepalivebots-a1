const mineflayer = require('mineflayer');
const express = require('express');
const cors = require('cors');

// ============================================
// 0. HELPERS
// ============================================
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// 1. CONFIG BOT 1 (KeepAliveBot - Aero PVP)
// ============================================
const BOT_1_OPTIONS = {
  host: 'aero-pvp.play.hosting',
  port: 25565,
  username: 'KeepAliveBot',
  version: '1.21.1',
  hideInventory: true,
};
const BOT_1_PASSWORD = '<passKeepAliveBot>';

const KITS = ['Diamond Smp', 'Sword', 'Mace', 'Crystal PVP', 'Spear Mace'];

let currentKit = null;
let allLeaderboards = {
  'Diamond Smp': [],
  'Sword': [],
  'Mace': [],
  'Crystal PVP': [],
  'Spear Mace': [],
};

// ============================================
// 2. CONFIG BOT 2 (TheKiddoBot - Empire SMP)
// ============================================
const BOT_2_OPTIONS = {
  host: 'theempiresmp.play.hosting',
  port: 25565,
  username: 'Thekiddo_Bot',
  version: '1.21.1',
};
const BOT_2_PASSWORD = '<passKeepAliveBot>';

// ============================================
// 3. STATE MACHINE PER BOT
// ============================================
// Elke bot heeft exact één state-object. Alle events lezen/schrijven hierin.
// States: 'idle' | 'connecting' | 'online' | 'reconnecting' | 'stopped'

function createBotState(name) {
  return {
    name,
    status: 'idle',
    bot: null,
    reconnectTimer: null,
    loopRunning: false,
    reconnectDelay: 5000,
    maxReconnectDelay: 60000,
  };
}

const state1 = createBotState('KeepAliveBot');
const state2 = createBotState('TheKiddoBot');

// ============================================
// 4. GENERIEKE RECONNECT + CLEANUP
// ============================================
function cleanupBot(state) {
  if (state.bot) {
    try {
      state.bot.removeAllListeners();
      state.bot.end();
    } catch (_) {}
    state.bot = null;
  }
}

function scheduleReconnect(state, startFn, reason) {
  if (state.reconnectTimer) {
    console.log(`[${state.name}] ⚠️ Reconnect al gepland, skip (${reason})`);
    return;
  }
  if (state.status === 'stopped') return;

  state.status = 'reconnecting';
  const delay = state.reconnectDelay;
  console.log(`[${state.name}] 🔁 Reconnect in ${delay / 1000}s (${reason})`);

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    startFn();
  }, delay);

  // Exponentiële backoff, capped
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, state.maxReconnectDelay);
}

function resetReconnectDelay(state) {
  state.reconnectDelay = 5000;
}

// ============================================
// 5. BOT 1 (Aero PVP & Leaderboards)
// ============================================
function startBot1() {
  if (state1.status === 'connecting' || state1.status === 'online') {
    console.log('[KeepAliveBot] ⚠️ Al verbonden/verbindend, skip start.');
    return;
  }
  if (state1.reconnectTimer) {
    console.log('[KeepAliveBot] ⚠️ Reconnect-timer loopt al, skip start.');
    return;
  }

  state1.status = 'connecting';
  console.log('[KeepAliveBot] Verbinden...');

  const bot = mineflayer.createBot(BOT_1_OPTIONS);
  state1.bot = bot;

  bot.once('spawn', async () => {
    if (state1.status !== 'connecting') return; // verlopen spawn
    state1.status = 'online';
    resetReconnectDelay(state1);
    console.log('[KeepAliveBot] ✅ Ingelogd en gespawned op Aero PVP.');

    await sleep(2000);
    if (state1.status !== 'online') return;
    bot.chat(`/register ${BOT_1_PASSWORD} ${BOT_1_PASSWORD}`);

    await sleep(2000);
    if (state1.status !== 'online') return;
    bot.chat(`/login ${BOT_1_PASSWORD}`);

    await sleep(3000);

    // Loop-guard: start de while-loop maar één keer per online-sessie
    if (state1.loopRunning) {
      console.log('[KeepAliveBot] ⚠️ Loop loopt al, skip.');
      return;
    }
    state1.loopRunning = true;

    try {
      while (state1.status === 'online') {
        console.log('[KeepAliveBot] 🔄 Leaderboards verversen...');
        for (const kit of KITS) allLeaderboards[kit] = [];

        for (const kit of KITS) {
          if (state1.status !== 'online') break;
          currentKit = kit;
          bot.chat(`/duel top ${kit}`);
          await sleep(3000);
        }
        currentKit = null;

        if (state1.status !== 'online') break;
        console.log('[KeepAliveBot] ✅ Alle kits opgehaald. Wacht 5 minuten...');
        await sleep(5 * 60 * 1000);
      }
    } finally {
      state1.loopRunning = false;
      currentKit = null;
      console.log('[KeepAliveBot] Loop gestopt.');
    }
  });

  bot.on('messagestr', (message) => {
    if (!currentKit) return;
    if (state1.status !== 'online') return;

    const regex = /^#(\d+)\s*•\s*([^\s-]+)\s*-\s*(\d+)\s*rating/i;
    const match = message.trim().match(regex);
    if (!match) return;

    const playerName = match[2];
    const playerRating = parseInt(match[3], 10);

    const list = allLeaderboards[currentKit];
    const idx = list.findIndex((p) => p.player === playerName);
    const obj = { player: playerName, rating: playerRating };

    if (idx !== -1) list[idx] = obj;
    else list.push(obj);
  });

  bot.on('kicked', (reason) => {
    console.log('[KeepAliveBot] ❌ Gekickt:', reason);
    handleDisconnect1('kicked');
  });

  bot.on('error', (err) => {
    console.log('[KeepAliveBot] ⚠️ Error:', err.message);
    // 'end' volgt meestal; daar regelen we reconnect
  });

  bot.on('end', (reason) => {
    console.log(`[KeepAliveBot] Verbinding verbroken (${reason})`);
    handleDisconnect1('end');
  });
}

function handleDisconnect1(reason) {
  if (state1.status === 'reconnecting' || state1.status === 'stopped') return;
  state1.status = 'reconnecting';
  state1.loopRunning = false;
  cleanupBot(state1);
  scheduleReconnect(state1, startBot1, reason);
}

// ============================================
// 6. BOT 2 (Empire SMP)
// ============================================
function startBot2() {
  if (state2.status === 'connecting' || state2.status === 'online') {
    console.log('[TheKiddoBot] ⚠️ Al verbonden/verbindend, skip start.');
    return;
  }
  if (state2.reconnectTimer) {
    console.log('[TheKiddoBot] ⚠️ Reconnect-timer loopt al, skip start.');
    return;
  }

  state2.status = 'connecting';
  console.log(`[TheKiddoBot] Verbinden met ${BOT_2_OPTIONS.host}...`);

  const bot = mineflayer.createBot(BOT_2_OPTIONS);
  state2.bot = bot;

  bot.once('spawn', () => {
    if (state2.status !== 'connecting') return;
    state2.status = 'online';
    resetReconnectDelay(state2);
    console.log('[TheKiddoBot] ✅ Ingelogd en gespawned');

    if (BOT_2_PASSWORD) {
      setTimeout(() => {
        if (state2.status !== 'online') return;
        console.log('[TheKiddoBot] Auth commando sturen...');
        bot.chat(`/register ${BOT_2_PASSWORD} ${BOT_2_PASSWORD}`);
        setTimeout(() => {
          if (state2.status !== 'online') return;
          bot.chat(`/login ${BOT_2_PASSWORD}`);
        }, 1000);
      }, 1000);
    }
  });

  bot.on('kicked', (reason) => {
    console.log('[TheKiddoBot] ❌ Gekickt:', reason);
    handleDisconnect2('kicked');
  });

  bot.on('error', (err) => {
    console.log('[TheKiddoBot] ⚠️ Error:', err.message);
  });

  bot.on('end', (reason) => {
    console.log(`[TheKiddoBot] Disconnect (${reason})`);
    handleDisconnect2('end');
  });
}

function handleDisconnect2(reason) {
  if (state2.status === 'reconnecting' || state2.status === 'stopped') return;
  state2.status = 'reconnecting';
  cleanupBot(state2);
  scheduleReconnect(state2, startBot2, reason);
}

// ============================================
// 7. EXPRESS API
// ============================================
const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  let liveCount = 0;
  if (state2.status === 'online' && state2.bot && state2.bot.players) {
    liveCount = Object.keys(state2.bot.players).filter(
      (n) => n !== state2.bot.username
    ).length;
  }
  res.status(200).send(liveCount.toString());
});

app.get('/aero/stats/all', (req, res) => res.json(allLeaderboards));
app.get('/aero/stats/diamond-smp', (req, res) => res.json(allLeaderboards['Diamond Smp']));
app.get('/aero/stats/sword', (req, res) => res.json(allLeaderboards['Sword']));
app.get('/aero/stats/mace', (req, res) => res.json(allLeaderboards['Mace']));
app.get('/aero/stats/crystal-pvp', (req, res) => res.json(allLeaderboards['Crystal PVP']));
app.get('/aero/stats/spear-mace', (req, res) => res.json(allLeaderboards['Spear Mace']));

app.get('/status', (req, res) => {
  res.json({
    bot1: { status: state1.status, loopRunning: state1.loopRunning, reconnectDelay: state1.reconnectDelay },
    bot2: { status: state2.status, reconnectDelay: state2.reconnectDelay },
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP] API Server draait op poort ${PORT}`);
  console.log(`[HTTP] Endpoints: /, /ping, /status, /aero/stats/*`);
});

// ============================================
// 8. START
// ============================================
startBot1();
startBot2();
