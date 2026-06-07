const User = require('../models/User');
const EmbedHelper = require('../utils/embedBuilder');
const GameImages = require('../utils/gameImages');
const Ranks = require('../utils/ranks');
const config = require('../config');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'points', 'b'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = new User({ userId: target.id, username: target.username });
      await user.save();
    }

    const usdValue = (user.balance * config.conversionRate).toFixed(2);
    const totalWagered = user.totalWagered || 0;
    const { rank } = Ranks.getRank(totalWagered);
    const rankEmoji = rank ? rank.emoji : config.emojis.highroller;

    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 128 });
    const buffer = await GameImages.createBalanceCard(
      user.username,
      user.balance,
      usdValue,
      avatarUrl,
      user.gamesPlayed,
      user.wins,
      user.losses
    );

    const embed = EmbedHelper.createDefault()
      .setTitle(`${rankEmoji} ${target.username}'s Balance`)
      .addFields(
        { name: `${config.emojis.wallet} Points`, value: `**${user.balance.toLocaleString()} pts**`, inline: false },
        { name: `${config.emojis.money} USD Value`, value: `**$${usdValue}**`, inline: false }
      )
      .setColor(config.colors.info)
      .setImage(buffer ? 'attachment://balance.png' : null);

    const files = buffer ? [new AttachmentBuilder(buffer, { name: 'balance.png' })] : [];
    message.reply({ embeds: [embed], files });
  }
};
