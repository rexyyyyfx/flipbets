const crypto = require('crypto');
const ProvablyFair = require('../utils/provablyFair');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'fair',
  aliases: ['seed', 'seeds'],
  async execute(message, args, user) {
    const cs = user.clientSeed || 'not set - using random';

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.verified} Provably Fair`)
      .setDescription(`Your personal provably fair settings for **Flipbets**.`)
      .addFields(
        { name: `${config.emojis.diamond} Client Seed`, value: `\`${cs}\``, inline: false },
        { name: `${config.emojis.highroller} Next Server Seed Hash`, value: `\`${ProvablyFair.hashServerSeed(ProvablyFair.generateServerSeed())}\``, inline: false },
        { name: `${config.emojis.alert} Note`, value: `Use \`${config.prefix}rotate <seed>\` to change your client seed. Leave seed empty for a random one.`, inline: false }
      )
      .setColor(config.colors.info)
      .setFooter({ text: 'Flipbets • Provably Fair' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
