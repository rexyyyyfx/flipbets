const crypto = require('crypto');
const User = require('../models/User');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'rotate',
  aliases: ['setseed'],
  async execute(message, args, user) {
    let newSeed;
    if (args.length > 0 && args[0].toLowerCase() !== 'random') {
      newSeed = args.join(' ');
      if (newSeed.length < 4) return message.reply(`${config.emojis.warning} Seed must be at least 4 characters.`);
    } else {
      newSeed = crypto.randomBytes(16).toString('hex');
    }

    const u = await User.findOne({ userId: user.userId });
    u.clientSeed = newSeed;
    await u.save();

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.tick} Seed Rotated`)
      .setDescription(`Your client seed has been updated.`)
      .addFields(
        { name: `${config.emojis.diamond} New Client Seed`, value: `\`${newSeed}\``, inline: false },
        { name: `${config.emojis.alert} Important`, value: 'Future games will use this new seed. Previous games are unaffected.', inline: false }
      )
      .setColor(config.colors.success)
      .setFooter({ text: 'EzBet • Provably Fair' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
