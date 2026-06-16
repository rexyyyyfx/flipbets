const User = require('../models/User');
const Settings = require('../models/Settings');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'house',
  aliases: ['housebal', 'hbal', 'hb'],
  async execute(message) {
    await message.reply(`${config.emojis.loading} Fetching house balance...`);

    try {
      const [depResult, balResult, wdrResult, fakeDoc] = await Promise.all([
        User.aggregate([{ $group: { _id: null, total: { $sum: '$totalDeposited' } } }]),
        User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
        User.aggregate([{ $group: { _id: null, total: { $sum: '$totalWithdrawn' } } }]),
        Settings.findOne({ key: 'houseFakeBalance' }).lean()
      ]);

      const totalDeposited = depResult[0]?.total || 0;
      const totalBal = balResult[0]?.total || 0;
      const totalWithdrawn = wdrResult[0]?.total || 0;
      const fakeBal = fakeDoc ? Number(fakeDoc.value) || 0 : 0;
      const netHouse = totalDeposited - totalWithdrawn - totalBal + fakeBal;

      const toUsd = (pts) => `$${(pts * config.conversionRate).toFixed(2)}`;
      const toPts = (pts) => `${Math.floor(pts).toLocaleString()} pts`;

      const embed = EmbedHelper.createDefault()
        .setTitle(`${config.emojis.litecoin} House Balance`)
        .setDescription('EzBet Casino Reserves')
        .addFields(
          { name: `${config.emojis.money} Deposited`, value: `${toUsd(totalDeposited)} (${toPts(totalDeposited)})`, inline: true },
          { name: `${config.emojis.wallet} Held by Players`, value: `${toUsd(totalBal)} (${toPts(totalBal)})`, inline: true },
          { name: `${config.emojis.verified} House Balance`, value: `${toUsd(Math.max(0, netHouse))} (${toPts(Math.max(0, netHouse))})`, inline: true }
        )
        .setColor(config.colors.gold)
        .setFooter({ text: 'EzBet • House Balance' })
        .setTimestamp();

      EmbedHelper.withWebsiteLink(embed);
      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      message.reply(`${config.emojis.cross} Could not fetch house balance.`);
    }
  }
};
