const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');
const { TOS_EMBEDS } = require('../utils/tos');

module.exports = {
  name: 'tos',
  async execute(message) {
    try {
      const embeds = TOS_EMBEDS().map(e => EmbedHelper.createDefault()
        .setTitle(`${config.emojis.verified} ${e.title}`)
        .setDescription(e.description)
        .setColor(config.colors.info)
        .setFooter({ text: e.footer })
        .setTimestamp()
      );
      await message.author.send({ embeds });
      await message.reply(`${config.emojis.tick} Check your DMs for the Terms of Service.`);
    } catch {
      await message.reply(`${config.emojis.warning} Could not send you a DM. Please enable DMs from server members.`);
    }
  }
};
