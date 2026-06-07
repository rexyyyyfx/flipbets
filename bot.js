const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const Logger = require('./utils/logger');
const { connectDB } = require('./models/db');
const DepositMonitor = require('./utils/depositMonitor');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

client.commands = new Collection();

function loadCommands(dir, category = '') {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      loadCommands(fullPath, item.name);
    } else if (item.name.endsWith('.js')) {
      try {
        const command = require(fullPath);
        const cmdName = item.name.replace('.js', '');
        command.category = category || 'general';
        command.name = cmdName;
        client.commands.set(cmdName, command);
        Logger.success(`Loaded command: ${cmdName}${category ? ` (${category})` : ''}`);
      } catch (error) {
        Logger.error(`Failed to load command ${item.name}: ${error.message}`);
      }
    }
  }
}

function loadEvents(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const event = require(path.join(dir, file));
      const eventName = event.name === 'ready' ? 'clientReady' : event.name;
      if (event.once) {
        client.once(eventName, (...args) => event.execute(...args));
      } else {
        client.on(eventName, (...args) => event.execute(...args));
      }
      Logger.success(`Loaded event: ${event.name}`);
    } catch (error) {
      Logger.error(`Failed to load event ${file}: ${error.message}`);
    }
  }
}

loadCommands(path.join(__dirname, 'commands'));
loadEvents(path.join(__dirname, 'events'));

client.on('error', (error) => {
  Logger.error(`Client error: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  if (error.code === 11000) return;
  Logger.error(`Unhandled rejection: ${error.message}`);
});

connectDB().then(() => {
  client.login(config.token).catch(err => {
    Logger.error(`Failed to login: ${err.message}`);
    process.exit(1);
  });
});

module.exports = client;
