const Settings = require('../models/Settings');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

module.exports = {
  name: 'maintenance',
  aliases: ['maint', 'maintenace'],
  async execute(message, args) {
    const isAdmin = config.ownerIds.includes(message.author.id);
    const action = (args[0] || '').toLowerCase();

    if (isAdmin && (action === 'on' || action === 'off' || action === 'toggle')) {
      let s = await Settings.findOne({ key: 'maintenance' });
      let on = s?.value === true;
      if (action === 'on') on = true;
      else if (action === 'off') on = false;
      else on = !on;
      await Settings.findOneAndUpdate(
        { key: 'maintenance' },
        { key: 'maintenance', value: on },
        { upsert: true }
      );
      return message.reply({
        embeds: [EmbedHelper.createSuccess(
          'Maintenance Mode',
          on ? 'Casino is now **under maintenance**. Players cannot bet.' : 'Maintenance mode **disabled**. Casino is live.'
        )]
      });
    }

    const s = await Settings.findOne({ key: 'maintenance' });
    if (s?.value === true) {
      const emb = EmbedHelper.createDefault()
        .setTitle(`${config.emojis.warning} Casino Under Maintenance`)
        .setDescription('Flipbets is currently under maintenance. Please try again later.')
        .setColor(config.colors.warning);
      EmbedHelper.withWebsiteLink(emb);
      return message.reply({ embeds: [emb] });
    }

    if (isAdmin) {
      return message.reply({
        embeds: [EmbedHelper.createInfo('Maintenance', 'Casino is **live**. Use `.maintenance on` / `.maintenance off` to toggle.')]
      });
    }
    return message.reply({
      embeds: [EmbedHelper.createSuccess('All Systems Go', 'The casino is online and ready to play!')]
    });
  }
};
