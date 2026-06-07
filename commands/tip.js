const { AttachmentBuilder } = require('discord.js');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const EmbedHelper = require('../utils/embedBuilder');
const GameImages = require('../utils/gameImages');
const config = require('../config');
const crypto = require('crypto');

function roundPoints(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

module.exports = {
  name: 'tip',
  aliases: ['give'],
  async execute(message, args, user) {
    if (args.length < 2) return message.reply('Usage: `.tip @user <amount>`');

    const target = message.mentions.users.first();
    if (!target) return message.reply('Please mention a user.');
    if (target.id === message.author.id) return message.reply('You cannot tip yourself.');
    if (target.bot) return message.reply('Cannot tip bots.');

    const amount = roundPoints(parseFloat(args[1]));
    if (!Number.isFinite(amount) || amount <= 0) return message.reply('Enter a valid amount.');
    if (user.balance < amount) {
      if (user.balance <= 0) return message.reply('Invalid points — top up your balance to tip.');
      return message.reply(`Insufficient balance. You have **${fmt(user.balance)}** pts.`);
    }
    if ((user.wagerRequired || 0) > 0) {
      return message.reply('Wager requirement not met — wager **' + Math.floor(user.wagerRequired).toLocaleString() + '** more pts to unlock tipping.');
    }

    let targetUser = await User.findOne({ userId: target.id });
    if (!targetUser) {
      targetUser = await User.create({ userId: target.id, username: target.username });
    }

    user.balance = roundPoints(user.balance - amount);
    targetUser.balance = roundPoints(targetUser.balance + amount);
    targetUser.wagerRequired = roundPoints((targetUser.wagerRequired || 0) + amount * 2);
    targetUser.tipLocked = roundPoints((targetUser.tipLocked || 0) + amount * 2);
    await user.save();
    await targetUser.save();

    const txId = 'TIP' + crypto.randomBytes(4).toString('hex').toUpperCase();
    await Transaction.create({
      transactionId: txId,
      userId: message.author.id,
      username: message.author.username,
      type: 'admin',
      amount: -amount,
      description: `Tipped ${fmt(amount)} pts to ${target.username}`
    });
    await Transaction.create({
      transactionId: `${txId}R`,
      userId: target.id,
      username: target.username,
      type: 'admin',
      amount,
      description: `Tip received from ${message.author.username}`
    });

    const usdValue = (amount * config.conversionRate).toFixed(2);
    const image = await GameImages.createTipImage(
      message.author.username,
      target.username,
      amount,
      usdValue,
      message.author.displayAvatarURL({ extension: 'png', size: 128 }),
      target.displayAvatarURL({ extension: 'png', size: 128 })
    );

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.gift} Tip Successful`)
      .setDescription(`**${fmt(amount)} pts** ($${usdValue} USD)`)
      .addFields(
        { name: 'From', value: `${message.author}`, inline: true },
        { name: 'To', value: `${target}`, inline: true }
      )
      .setColor(config.colors.success)
      .setImage(image ? 'attachment://tip.png' : null);
    const files = image ? [new AttachmentBuilder(image, { name: 'tip.png' })] : [];

    await message.reply({ embeds: [embed], files });

    const dmPayload = {
      embeds: [embed],
      files: image ? [new AttachmentBuilder(image, { name: 'tip.png' })] : []
    };
    await message.author.send(dmPayload).catch(() => {});
    await target.send({
      embeds: [embed],
      files: image ? [new AttachmentBuilder(image, { name: 'tip.png' })] : []
    }).catch(() => {});
  }
};
