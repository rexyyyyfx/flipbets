const User = require('../models/User');
const Game = require('../models/Game');
const EmbedHelper = require('../utils/embedBuilder');
const Ranks = require('../utils/ranks');
const config = require('../config');

module.exports = {
  name: 'profile',
  aliases: ['p', 'stats'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = new User({ userId: target.id, username: target.username });
      await user.save();
    }

    const winRate = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : 0;
    const profit = user.totalWagered > 0 ? user.totalProfit : 0;
    const recentGames = await Game.find({ userId: user.userId }).sort({ createdAt: -1 }).limit(5);
    const { rank } = Ranks.getRank(user.totalWagered || 0);
    const rankEmoji = rank ? rank.emoji : config.emojis.highroller;

    const recentText = recentGames.length > 0
      ? recentGames.map(g => `${g.result === 'win' ? config.emojis.tick : config.emojis.cross} ${g.gameType}: ${g.betAmount} pts`).join('\n')
      : 'No recent games';

    const embed = EmbedHelper.createDefault()
      .setTitle(`${rankEmoji} ${user.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: `${config.emojis.wallet} Balance`, value: `${config.emojis.money} ${user.balance.toLocaleString()} pts`, inline: true },
        { name: 'USD Value', value: `$${(user.balance * config.conversionRate).toFixed(2)}`, inline: true },
        { name: `${rankEmoji} Rank`, value: rank ? `${rank.emoji} ${rank.name}` : `${config.emojis.highroller} Unranked`, inline: true },
        { name: 'Games Played', value: `${user.gamesPlayed}`, inline: true },
        { name: `${config.emojis.tick} Wins`, value: `${user.wins}`, inline: true },
        { name: `${config.emojis.cross} Losses`, value: `${user.losses}`, inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Total Wagered', value: `${user.totalWagered.toLocaleString()} pts`, inline: true },
        { name: 'Total Deposited', value: `${user.totalDeposited.toLocaleString()} pts`, inline: true },
        { name: 'Total Withdrawn', value: `${user.totalWithdrawn.toLocaleString()} pts`, inline: true },
        { name: 'Recent Games', value: recentText, inline: false }
      )
      .setColor(config.colors.primary)
      .setFooter({ text: `Flipbets • Profile` });

    message.reply({ embeds: [embed] });
  }
};
