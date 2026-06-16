const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config');

class EmbedHelper {
  static createDefault() {
    return new EmbedBuilder().setColor(config.colors.primary);
  }

  static createGameEmbed(title, description, fields = [], footer = null, avatarURL = null) {
    const embed = this.createDefault()
      .setTitle(title)
      .setDescription(description)
      .setColor(config.colors.primary);
    if (fields.length) embed.addFields(fields);
    if (footer) embed.setFooter({ text: footer });
    if (avatarURL) embed.setThumbnail(avatarURL);
    return embed;
  }

  static createError(message) {
    return this.createDefault()
      .setTitle(`${config.emojis.cross} Error`)
      .setDescription(message)
      .setColor(config.colors.error);
  }

  static createSuccess(title, description) {
    const embed = this.createDefault()
      .setTitle(`${config.emojis.tick} ${title || 'Success'}`)
      .setColor(config.colors.success);
    if (description) embed.setDescription(description);
    return embed;
  }

  static createInfo(title, description) {
    const embed = this.createDefault()
      .setTitle(`${config.emojis.verified} ${title || 'Info'}`)
      .setColor(config.colors.info);
    if (description) embed.setDescription(description);
    return embed;
  }

  static withWebsiteLink(embed) {
    return embed;
  }

  static createBalanceEmbed(user, balance, avatarURL) {
    const embed = this.createDefault()
      .setTitle(`${config.emojis.wallet} Balance`)
      .setDescription(`**${user.username}**'s Wallet`)
      .addFields(
        { name: 'Points', value: `${config.emojis.coin} **${balance.toLocaleString()}**`, inline: true },
        { name: 'USD Value', value: `$${(balance * config.conversionRate).toFixed(2)} USD`, inline: true }
      )
      .setColor(config.colors.info);
    if (avatarURL) embed.setThumbnail(avatarURL);
    return embed;
  }

  static createDepositEmbed(address, qrBuffer, currency) {
    const embed = this.createDefault()
      .setTitle(`📥 ${config.emojis.litecoin} Deposit`)
      .setDescription(`Send **LTC** to the address below:\n\`\`\`${address}\`\`\``)
      .addFields(
        { name: `${config.emojis.litecoin} Currency`, value: 'Litecoin (LTC)', inline: true },
        { name: 'Status', value: 'Waiting for payment...', inline: true },
        { name: 'Note', value: 'Deposits are monitored automatically. You will receive a DM when detected.', inline: false }
      )
      .setColor(config.colors.gold);
    const attachment = new AttachmentBuilder(qrBuffer, { name: 'qr.png' });
    embed.setImage('attachment://qr.png');
    return { embeds: [embed], files: [attachment] };
  }

  static createPublicBetEmbed(gameData) {
    const resultText = gameData.result === 'win' ? `${config.emojis.tick} **WON**` : `${config.emojis.cross} **LOST**`;
    const profit = gameData.result === 'win' ? `+${gameData.payout}` : `-${gameData.betAmount}`;
    const emojiMap = {
      'Mines': config.emojis.gem,
      'Limbo': '🚀',
      'Crash': '🚀',
      'Blackjack': config.emojis.cards,
      'Wheel': config.emojis.highroller,
      'Roulette': config.emojis.highroller,
      'Market': config.emojis.highroller,
      'Hilo': config.emojis.cards,
      'Baccarat': config.emojis.heart,
      'Coinflip': config.emojis.heads
    };
    const titleEmoji = emojiMap[gameData.gameType] || config.emojis.coin;
    return this.createDefault()
      .setTitle(`${titleEmoji} ${gameData.gameType} Bet`)
      .setDescription(`${gameData.username} ${resultText} **${gameData.betAmount}** points on **${gameData.gameType}**`)
      .addFields(
        { name: `${config.emojis.money} Bet Amount`, value: `${gameData.betAmount} pts`, inline: true },
        { name: `${config.emojis.coin} Payout`, value: `${gameData.payout} pts`, inline: true },
        { name: 'Profit', value: `${profit} pts`, inline: true },
        { name: `${config.emojis.highroller} Multiplier`, value: `x${gameData.multiplier.toFixed(2)}`, inline: true },
        { name: `${config.emojis.verified} Game ID`, value: `\`${gameData.gameId}\``, inline: true }
      )
      .setColor(gameData.result === 'win' ? config.colors.success : config.colors.error)
      .setFooter({ text: `EzBet • Game ID: ${gameData.gameId}` })
      .setTimestamp();
  }
}

module.exports = EmbedHelper;
