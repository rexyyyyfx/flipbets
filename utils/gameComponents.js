const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function betAgainRow(command, args = []) {
  const safeArgs = args.map(arg => String(arg)).join(' ').slice(0, 70);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`betagain|${command}|${safeArgs}`)
      .setLabel('Bet Again')
      .setStyle(ButtonStyle.Primary)
  );
}

module.exports = { betAgainRow };
