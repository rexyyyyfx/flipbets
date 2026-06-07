const { CRASH_CHANNEL_ID } = require('../../utils/crashLoop');

module.exports = {
  name: 'crash',
  aliases: ['cr'],
  async execute(message) {
    return message.reply(`Crash runs 24/7 in <#${CRASH_CHANNEL_ID}>. Use the **Place Bet** button there.`);
  }
};
