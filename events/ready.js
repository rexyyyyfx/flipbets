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
      activities: [{ name: '.gg/ezbet • Best LTC Casino', type: ActivityType.Playing }],
      status: 'dnd'
    });

    const gamblingChannel = client.channels.cache.get(config.gamblingChannel);
    if (gamblingChannel) {
      Logger.success('Gambling channel found and ready');
    }
    if (config.gamblingChannels && config.gamblingChannels.length > 1) {
      Logger.info(`Bot accepts game commands in ${config.gamblingChannels.length} channels: ${config.gamblingChannels.join(', ')}`);
    }

    const publicBetsChannel = client.channels.cache.get(config.publicBetsChannel);
    if (publicBetsChannel) {
      Logger.success('Public bets channel found and ready');
    }
    if (config.publicBetsChannels && config.publicBetsChannels.length > 1) {
      Logger.info(`Public bet announcements will be broadcast to ${config.publicBetsChannels.length} channels`);
    }

    crashLoop.start(client);
    DepositMonitor.start(client);
  }
};
