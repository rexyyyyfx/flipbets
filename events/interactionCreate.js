const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const crashLoop = require('../utils/crashLoop');
const Game = require('../models/Game');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('betagain|')) {
      const parts = interaction.customId.split('|');
      let ownerId = 'any';
      let commandName;
      let rawArgs = '';
      if (parts.length >= 4) {
        [, ownerId, commandName, rawArgs = ''] = parts;
      } else {
        [, commandName, rawArgs = ''] = parts;
      }
      if (ownerId !== 'any' && ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'This Bet Again button belongs to the original player.', flags: MessageFlags.Ephemeral });
      }
      const command = interaction.client.commands.get(commandName);
      if (!command) return interaction.reply({ content: 'That game is not available anymore.', flags: MessageFlags.Ephemeral });

      let user = await User.findOne({ userId: interaction.user.id });
      if (!user) {
        user = await User.create({ userId: interaction.user.id, username: interaction.user.username });
      }
      if (user.isBanned && !command.admin) return interaction.reply({ content: 'You are banned from using EzBet.', flags: MessageFlags.Ephemeral });

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

    if (interaction.isButton() && interaction.customId === 'accept_tos') {
      const u = await User.findOne({ userId: interaction.user.id });
      if (!u) return interaction.reply({ content: 'Account not found.', flags: MessageFlags.Ephemeral });
      if (u.acceptedTos) return interaction.reply({ content: 'You have already accepted the Terms of Service.', flags: MessageFlags.Ephemeral });
      u.acceptedTos = true;
      await u.save();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_tos').setLabel('Accepted').setStyle(ButtonStyle.Success).setDisabled(true)
      );
      await interaction.update({ components: [row] });
      return interaction.followUp({ content: '✅ You have accepted the Terms of Service. You may now use the bot.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId.startsWith('crash_')) {
      return crashLoop.handleInteraction(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'crash_bet_modal') {
      return crashLoop.handleInteraction(interaction);
    }
  }
};
