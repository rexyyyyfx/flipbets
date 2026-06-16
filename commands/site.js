const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'site',
  aliases: ['website', 'web'],
  async execute(message) {
    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.verified} EzBet Casino`)
      .setDescription('Play all games on our website with provably fair outcomes and instant deposits.')
      .setColor(config.colors.info)
      .setThumbnail(message.client.user.displayAvatarURL())
      .setTimestamp();
    EmbedHelper.withWebsiteLink(embed);
    return message.reply({ embeds: [embed] });
  }
};
