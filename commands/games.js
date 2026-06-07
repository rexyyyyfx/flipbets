const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'games',
  aliases: ['g', 'casino'],
  gambling: true,
  async execute(message, args) {
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Flipbets Games`)
      .setDescription('**Choose your game and place your bets!**')
      .addFields(
        {
          name: `${config.emojis.cards} Blackjack`,
          value: '`.blackjack <bet>` • Beat the dealer!',
          inline: true
        },
        {
          name: `${config.emojis.gem} Mines`,
          value: '`.mines <bet> <bombs>` • Reveal gems, avoid bombs!',
          inline: true
        },
        {
          name: `${config.emojis.heads} Coinflip`,
          value: '`.coinflip <bet> <h/t>` • 1.96x payout!',
          inline: true
        },
        {
          name: `🚀 Limbo`,
          value: '`.limbo <bet> <mult>` • Set your multiplier!',
          inline: true
        },
        {
          name: `🚀 Crash`,
          value: '`.crash` • Auto-running in crash channel!',
          inline: true
        },
        {
          name: `${config.emojis.highroller} Wheel`,
          value: '`.wheel <bet>` • Win up to 20x!',
          inline: true
        },
        {
          name: `${config.emojis.highroller} Roulette`,
          value: '`.roulette <bet> <type>` • Bet on red, black, numbers!',
          inline: true
        },
        {
          name: `${config.emojis.cards} Hi-Lo`,
          value: '`.hilo <bet>` • Higher or Lower!',
          inline: true
        },
        {
          name: `${config.emojis.heart} Baccarat`,
          value: '`.baccarat <bet> <p/b/t>` • Player, Banker, or Tie!',
          inline: true
        },
        {
          name: `${config.emojis.heads} CFight`,
          value: '`.cf <bet> <h/t> @user` • Duel someone!',
          inline: true
        }
      )
      .setColor(config.colors.primary)
      .setFooter({ text: 'Flipbets • Play Responsibly • Provably Fair' });

    EmbedHelper.withWebsiteLink(embed);
    message.reply({ embeds: [embed] });
  }
};
