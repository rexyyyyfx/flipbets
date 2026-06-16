const User = require('../models/User');
const ApironeAPI = require('../utils/apirone');
const EmbedHelper = require('../utils/embedBuilder');
const QRCode = require('qrcode');
const config = require('../config');

module.exports = {
  name: 'deposit',
  aliases: ['depo', 'dep'],
  async execute(message, args) {
    const currency = (args[0] || 'ltc').toLowerCase();
    if (currency !== 'ltc') {
      return message.reply(`${config.emojis.warning} Only \`ltc\` is supported.`);
    }

    await message.reply(`${config.emojis.loading} Generating deposit address...`);

    try {
      let user = await User.findOne({ userId: message.author.id });
      if (!user) {
        user = new User({ userId: message.author.id, username: message.author.username });
        await user.save();
      }

      const key = currency;
      let address = user.depositAddresses[key];

      if (!address || String(address).startsWith('MOCK_')) {
        const result = await ApironeAPI.generateAddress(currency, {
          userId: message.author.id,
          username: message.author.username
        });
        address = result.address;
        if (!address || address.startsWith('MOCK_')) {
          throw new Error('Apirone returned an invalid address. Contact admin.');
        }
        user.depositAddresses[key] = address;
        await user.save();
      }

      const qrBuffer = await QRCode.toBuffer(address, { width: 300, margin: 2 });
      const embedData = EmbedHelper.createDepositEmbed(address, qrBuffer, currency);

      try {
        await message.author.send(embedData);
        await message.reply(`${config.emojis.money} Check your DMs for deposit information!`);
      } catch {
        await message.reply(embedData);
      }
    } catch (error) {
      console.error(error);
      message.reply(`${config.emojis.cross} ${error.message}`);
    }
  }
};
