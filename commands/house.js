const User = require('../models/User');
const ApironeAPI = require('../utils/apirone');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'house',
  aliases: ['housebal', 'hbal', 'hb'],
  async execute(message) {
    await message.reply(`${config.emojis.loading} Fetching house balance...`);

    try {
      const ltcBal = await ApironeAPI.getBalance('ltc');
      const totalSat = ltcBal.total || ltcBal.available || 0;
      const totalLtc = totalSat / 1e8;
      const ltcUsd = totalLtc * 80;

      const agg = await User.aggregate([
        { $group: { _id: null, totalBalance: { $sum: '$balance' } } }
      ]);
      const playerPts = agg[0]?.totalBalance || 0;
      const playerUsd = playerPts * config.conversionRate;

      const embed = EmbedHelper.createDefault()
        .setTitle(`${config.emojis.litecoin} House Balance`)
        .setDescription('Flipbets Casino Reserves')
        .addFields(
          { name: `${config.emojis.money} House Balance`, value: `**$${ltcUsd.toFixed(2)}** (${totalLtc.toFixed(6)} LTC)`, inline: true },
          { name: `${config.emojis.wallet} Held by Players`, value: `**$${playerUsd.toFixed(2)}** (${Math.floor(playerPts).toLocaleString()} pts)`, inline: true }
        )
        .setColor(config.colors.gold)
        .setFooter({ text: 'Flipbets • House Balance' })
        .setTimestamp();

      EmbedHelper.withWebsiteLink(embed);
      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      message.reply(`${config.emojis.cross} Could not fetch house balance. API might be unavailable.`);
    }
  }
};
