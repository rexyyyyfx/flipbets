const Game = require('../models/Game');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'history',
  aliases: ['hist', 'bets'],
  async execute(message, args, user) {
    const page = Math.max(1, parseInt(args[0]) || 1);
    const perPage = 10;
    const total = await Game.countDocuments({ userId: user.userId });
    const games = await Game.find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    if (!games.length) return message.reply(`${config.emojis.warning} No bet history found.`);

    const totalPages = Math.ceil(total / perPage) || 1;
    const emojiMap = {
      'Mines': config.emojis.gem,
      'Limbo': '🚀',
      'Crash': '🚀',
      'Blackjack': config.emojis.cards,
      'Wheel': config.emojis.highroller,
      'Roulette': config.emojis.highroller,
      'Hilo': config.emojis.cards,
      'Baccarat': config.emojis.heart,
      'Coinflip': config.emojis.heads
    };

    const lines = games.map(g => {
      const emoji = emojiMap[g.gameType] || config.emojis.coin;
      const resultEmoji = g.result === 'win' ? config.emojis.tick : config.emojis.cross;
      const profit = g.result === 'win' ? `+${g.payout}` : `-${g.betAmount}`;
      const date = g.createdAt ? `<t:${Math.floor(g.createdAt.getTime() / 1000)}:R>` : '';
      return `${resultEmoji} ${emoji} **${g.gameType}** • ${g.betAmount} pts → ${profit} pts ${date} \`${g.gameId}\``;
    });

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.wallet} Bet History - ${user.username}`)
      .setDescription(lines.join('\n'))
      .addFields(
        { name: 'Page', value: `${page}/${totalPages}`, inline: true },
        { name: 'Total Bets', value: `${total}`, inline: true }
      )
      .setColor(config.colors.info)
      .setFooter({ text: `Flipbets • Page ${page}/${totalPages}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
