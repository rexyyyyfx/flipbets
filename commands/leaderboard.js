const User = require('../models/User');
const EmbedHelper = require('../utils/embedBuilder');
const Ranks = require('../utils/ranks');
const config = require('../config');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  async execute(message) {
    const users = await User.find().sort({ balance: -1 }).limit(10);

    if (users.length === 0) return message.reply('No users yet!');

    const medals = ['🥇', '🥈', '🥉'];
    const entries = users.map((u, i) => {
      const medal = i < 3 ? medals[i] : `#${i + 1}`;
      const name = u.username.length > 15 ? u.username.substring(0, 15) + '...' : u.username;
      const { rank } = Ranks.getRank(u.totalWagered || 0);
      const rankEmoji = rank ? rank.emoji : '';
      return `${medal} ${rankEmoji} **${name}** — ${config.emojis.money} ${u.balance.toLocaleString()}`;
    });

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Leaderboard`)
      .setDescription(`**Top 10 Richest Players** ${config.emojis.money}\n\n${entries.join('\n')}`)
      .setColor(config.colors.gold)
      .setFooter({ text: 'Flipbets • Leaderboard' });

    message.reply({ embeds: [embed] });
  }
};
