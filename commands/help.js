const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'help',
  aliases: ['h', 'commands', 'cmds', 'menu'],
  async execute(message) {
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} EzBet Casino - Help`)
      .setDescription(`Welcome to **EzBet**. Use the commands below to play.`)
      .addFields(
        {
          name: `${config.emojis.gem} Games`,
          value: [
            `${config.emojis.gem} \`.mines <bet> <bombs>\` - Reveal tiles and avoid bombs.`,
            `${config.emojis.gem} \`.tower <bet>\` - Pick a difficulty, climb 9 floors, cash out anytime.`,
            `${config.emojis.rocket} \`.limbo <bet> <mult>\` - Predict the multiplier.`,
            `${config.emojis.rocket} \`.crash\` - Cashout before it crashes.`,
            `${config.emojis.cards} \`.blackjack <bet>\` - Classic Blackjack.`,
            `${config.emojis.highroller} \`.wheel <bet>\` - Weighted wheel up to 10x.`,
            `${config.emojis.highroller} \`.roulette <bet> <type>\` - Bet on red, black, numbers, columns, dozens.`,
            `${config.emojis.highroller} \`.market <bet> <up/down>\` - Predict the market direction.`,
            `${config.emojis.cards} \`.hilo <bet>\` - Higher or lower.`,
            `${config.emojis.heart} \`.baccarat <bet> <p/b/t>\` - Player, banker, or tie.`,
            `${config.emojis.heads} \`.coinflip <bet> <h/t>\` - Heads or tails, 1.96x.`,
            `${config.emojis.heads} \`.cf <bet> <h/t> @user\` - Duel someone in coinflip.`
          ].join('\n'),
          inline: false
        },
        {
          name: `${config.emojis.money} Economy`,
          value: [
            `${config.emojis.wallet} \`.balance\` - Check your balance.`,
            `${config.emojis.litecoin} \`.deposit\` - Get your LTC deposit address in DM.`,
            `${config.emojis.wallet} \`.withdraw <currency> <addr> <pts>\` - Withdraw your winnings.`,
            `${config.emojis.gift} \`.tip @user <pts>\` - Send points to friends.`,
            `${config.emojis.gift} \`.claim <code>\` - Redeem a promo code.`,
            `${config.emojis.litecoin} \`.house\` - Check house balance.`
          ].join('\n'),
          inline: false
        },
        {
          name: `${config.emojis.verified} Utility`,
          value: [
            `${config.emojis.verified} \`.fair\` - View your provably fair seeds.`,
            `${config.emojis.diamond} \`.rotate <seed>\` - Change your client seed.`,
            `${config.emojis.highroller} \`.profile\` - View your stats and rank.`,
            `${config.emojis.highroller} \`.leaderboard\` - Wager leaderboard with daily, weekly, monthly tabs.`,
            `${config.emojis.highroller} \`.rank\` - View your rank progress.`,
            `${config.emojis.tick} \`.ranks\` - All ranks and requirements.`,
            `${config.emojis.highroller} \`.history\` - View your bet history.`,
            `${config.emojis.check} \`.verify <gameid>\` - Verify game fairness.`
          ].join('\n'),
          inline: false
        },
        {
          name: `${config.emojis.money} Info`,
          value: [
            `${config.emojis.coin} 1 point = **$0.01** USD.`,
            `${config.emojis.verified} All games are provably fair. Use \`.verify <gameid>\` to check.`
          ].join('\n'),
          inline: false
        }
      )
      .setColor(config.colors.primary)
      .setThumbnail(message.client.user.displayAvatarURL())
      .setFooter({ text: 'EzBet Casino - Provably Fair' })
      .setTimestamp();

    EmbedHelper.withWebsiteLink(embed);
    message.reply({ embeds: [embed] });
  }
};
