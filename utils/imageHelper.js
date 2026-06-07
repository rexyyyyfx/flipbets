const { AttachmentBuilder } = require('discord.js');

class ImageHelper {
  static createAttachment(buffer, name) {
    if (!buffer) return null;
    return new AttachmentBuilder(buffer, { name });
  }

  static setImage(embed, buffer, name) {
    if (buffer) {
      embed.setImage(`attachment://${name}`);
    }
    return embed;
  }

  static buildMessageOptions(embed, buffer, name, components = []) {
    const options = { embeds: [embed], components };
    if (buffer) {
      const attachment = new AttachmentBuilder(buffer, { name });
      options.files = [attachment];
    }
    return options;
  }
}

module.exports = ImageHelper;
