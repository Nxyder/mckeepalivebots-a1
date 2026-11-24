// config.js — gedeelde configuratie voor worker + supervisor
module.exports = {
  KITS: ['Diamond Smp', 'Sword', 'Mace', 'Crystal PVP', 'Spear Mace'],

  BOT_1: {
    host: 'aero-pvp.play.hosting',
    port: 25565,
    username: 'KeepAliveBot',
    version: '1.21.1',
    hideInventory: true,
    password: '<passKeepAliveBot>',
  },

  BOT_2: {
    host: 'theempiresmp.play.hosting',
    port: 25565,
    username: 'Thekiddo_Bot',
    version: '1.21.1',
    password: '<passKeepAliveBot>',
  },

  RECONNECT: {
    initialDelay: 5000,
    maxDelay: 60000,
  },

  LEADERBOARD_REFRESH_MS: 5 * 60 * 1000,
  KIT_QUERY_DELAY_MS: 3000,
  AUTH_DELAY_MS: 2000,

  // Keepalive: stuur elke 10s een packet naar de server
  KEEPALIVE_INTERVAL_MS: 10000,
};
