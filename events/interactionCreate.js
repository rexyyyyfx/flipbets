const { MessageFlags } = require('discord.js');
const User = require('../models/User');
const crashLoop = require('../utils/crashLoop');
const Game = require('../models/Game');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('betagain|')) {
      const [, commandName, rawArgs = ''] = interaction.customId.split('|');
      const command = interaction.client.commands.get(commandName);
      if (!command) return interaction.reply({ content: 'That game is not available anymore.', flags: MessageFlags.Ephemeral });

      let user = await User.findOne({ userId: interaction.user.id });
      if (!user) {
        user = await User.create({ userId: interaction.user.id, username: interaction.user.username });
      }
      if (user.isBanned && !command.admin) return interaction.reply({ content: 'You are banned from using Flipbets.', flags: MessageFlags.Ephemeral });

      const args = rawArgs.trim() ? rawArgs.trim().split(/ +/) : [];
      const fakeMessage = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel,
        client: interaction.client,
        mentions: { users: { first: () => null } },
        reply: async (payload) => {
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ ...payload, fetchReply: true });
          }
          return interaction.followUp({ ...payload, fetchReply: true });
        }
      };

      try {
        return command.execute(fakeMessage, args, user);
      } catch (error) {
        console.error(`Bet again error: ${error.message}`);
        return interaction.reply({ content: 'Could not run that bet again.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('crash_')) {
      return crashLoop.handleInteraction(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'crash_bet_modal') {
      return crashLoop.handleInteraction(interaction);
    }
  }
};
