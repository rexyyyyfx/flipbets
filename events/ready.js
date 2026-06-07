const { ActivityType } = require('discord.js');
const config = require('../config');
const Logger = require('../utils/logger');
const crashLoop = require('../utils/crashLoop');
const DepositMonitor = require('../utils/depositMonitor');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    Logger.success(`Logged in as ${client.user.tag}`);
    Logger.info(`Serving ${client.guilds.cache.size} guilds`);

    client.user.setPresence({
      activities: [{ name: 'Flipbets Casino 🎰', type: ActivityType.Playing }],
      status: 'dnd'
    });

    const gamblingChannel = client.channels.cache.get(config.gamblingChannel);
    if (gamblingChannel) {
      Logger.success('Gambling channel found and ready');
    }

    const publicBetsChannel = client.channels.cache.get(config.publicBetsChannel);
    if (publicBetsChannel) {
      Logger.success('Public bets channel found and ready');
    }

    crashLoop.start(client);
    DepositMonitor.start(client);
  }
};
