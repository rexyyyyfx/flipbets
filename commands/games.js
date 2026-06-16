const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'games',
  aliases: ['g', 'casino'],
  gambling: true,
  async execute(message) {
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} EzBet Games`)
      .setDescription('Choose your game and place your bets.')
      .addFields(
        { name: `${config.emojis.cards} Blackjack`, value: '`.blackjack <bet>` - Beat the dealer.', inline: true },
        { name: `${config.emojis.gem} Mines`, value: '`.mines <bet> <bombs>` - Reveal gems, avoid bombs.', inline: true },
        { name: `${config.emojis.gem} Towers`, value: '`.tower <bet>` - Climb 9 floors and cash out.', inline: true },
        { name: `${config.emojis.heads} Coinflip`, value: '`.coinflip <bet> <h/t>` - 1.96x payout.', inline: true },
        { name: `${config.emojis.rocket} Limbo`, value: '`.limbo <bet> <mult>` - Set your target multiplier.', inline: true },
        { name: `${config.emojis.rocket} Crash`, value: '`.crash` - Auto-running in crash channel.', inline: true },
        { name: `${config.emojis.highroller} Wheel`, value: '`.wheel <bet>` - Weighted wheel, up to 10x.', inline: true },
        { name: `${config.emojis.highroller} Roulette`, value: '`.roulette <bet> <type>` - Red, black, number, column, dozen.', inline: true },
        { name: `${config.emojis.highroller} Market`, value: '`.market <bet> <up/down>` - Predict the chart direction.', inline: true },
        { name: `${config.emojis.cards} Hi-Lo`, value: '`.hilo <bet>` - Higher or lower.', inline: true },
        { name: `${config.emojis.heart} Baccarat`, value: '`.baccarat <bet> <p/b/t>` - Player, banker, or tie.', inline: true },
        { name: `${config.emojis.heads} CFight`, value: '`.cf <bet> <h/t> @user` - Duel someone.', inline: true }
      )
      .setColor(config.colors.primary)
      .setFooter({ text: 'EzBet - Play Responsibly - Provably Fair' });

    EmbedHelper.withWebsiteLink(embed);
    message.reply({ embeds: [embed] });
  }
};
