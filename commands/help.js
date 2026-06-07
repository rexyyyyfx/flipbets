const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'help',
  aliases: ['h', 'commands', 'cmds', 'menu'],
  async execute(message, args) {
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Flipbets Casino - Help`)
      .setDescription(`Welcome to **Flipbets**! Your ultimate crypto gambling experience. ${config.emojis.litecoin}`)
      .addFields(
        { name: `${config.emojis.gem} Games`, value: [
          `${config.emojis.gem} \`.mines <bet> <bombs>\` — Reveal tiles and avoid bombs!`,
          `🚀 \`.limbo <bet> <mult>\` — Predict the multiplier!`,
          `🚀 \`.crash\` — Cashout before it crashes!`,
          `${config.emojis.cards} \`.blackjack <bet>\` — Classic Blackjack!`,
          `${config.emojis.highroller} \`.wheel <bet>\` — Spin and win up to x20!`,
          `${config.emojis.highroller} \`.roulette <bet> <type>\` — Bet on red, black, numbers!`,
          `${config.emojis.cards} \`.hilo <bet>\` — Higher or Lower!`,
          `${config.emojis.heart} \`.baccarat <bet> <p/b/t>\` — Classic Baccarat!`,
          `${config.emojis.heads} \`.coinflip <bet> <h/t>\` — Heads or tails, 1.96x!`,
          `${config.emojis.heads} \`.cf <bet> <h/t> @user\` — Duel someone in coinflip!`,
        ].join('\n'), inline: false },
        { name: `${config.emojis.money} Economy`, value: [
          `${config.emojis.wallet} \`.balance\` — Check your balance`,
          `📥 \`.deposit\` — Get deposit address in DM`,
          `📤 \`.withdraw <currency> <addr> <pts>\` — Withdraw your winnings`,
          `${config.emojis.gift} \`.tip @user <pts>\` — Send points to friends`,
          `${config.emojis.gift} \`.claim <code>\` — Redeem a promo code`,
          `${config.emojis.litecoin} \`.house\` — Check house balance`,
        ].join('\n'), inline: false },
        { name: `${config.emojis.verified} Utility`, value: [
          `${config.emojis.verified} \`.fair\` — View your provably fair seeds`,
          `${config.emojis.diamond} \`.rotate <seed>\` — Change your client seed`,
          `${config.emojis.highroller} \`.profile\` — View your stats and rank`,
          `${config.emojis.highroller} \`.leaderboard\` — Top 10 richest players`,
          `${config.emojis.highroller} \`.rank\` — View your rank progress`,
          `${config.emojis.tick} \`.ranks\` — All ranks and requirements`,
          `${config.emojis.highroller} \`.history\` — View your bet history`,
          `${config.emojis.check} \`.verify <gameid>\` — Verify game fairness`,
        ].join('\n'), inline: false },
        { name: `${config.emojis.money} Info`, value: [
          `${config.emojis.coin} 1 point = **$0.01** USD`,
          `${config.emojis.verified} All games are **provably fair**! Use \`.verify <gameid>\` to check.`,
        ].join('\n'), inline: false }
      )
      .setColor(config.colors.primary)
      .setThumbnail(message.client.user.displayAvatarURL())
      .setFooter({ text: `Flipbets Casino • Provably Fair • Crypto Gambling` })
      .setTimestamp();

    EmbedHelper.withWebsiteLink(embed);
    message.reply({ embeds: [embed] });
  }
};
