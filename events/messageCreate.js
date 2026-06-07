const config = require('../config');
const User = require('../models/User');
const Settings = require('../models/Settings');
const EmbedHelper = require('../utils/embedBuilder');

const WEBSITE_CMDS = ['help', 'h', 'commands', 'cmds', 'menu', 'site', 'website', 'games', 'g', 'casino'];

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    let command = message.client.commands.get(commandName);
    if (!command) {
      command = message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    }
    if (!command) return;

    const playChannels = config.gamblingChannels?.length ? config.gamblingChannels : [config.gamblingChannel].filter(Boolean);
    if (command.gambling && playChannels.length && !playChannels.includes(message.channel.id)) {
      const chMentions = playChannels.map(id => `<#${id}>`).join(' or ');
      return message.reply(`${config.emojis.money} Please use gambling commands in ${chMentions}`);
    }

    if (!command.admin) {
      const maint = await Settings.findOne({ key: 'maintenance' });
      if (maint?.value === true && !config.ownerIds.includes(message.author.id)) {
        const emb = EmbedHelper.createDefault()
          .setTitle(`${config.emojis.warning} Casino Under Maintenance`)
          .setDescription('Please try again later.')
          .setColor(config.colors.warning);
        EmbedHelper.withWebsiteLink(emb);
        return message.reply({ embeds: [emb] });
      }
    }

    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = await User.create({
        userId: message.author.id,
        username: message.author.username
      });
    }

    if (user.isBanned && !command.admin) {
      return message.reply(`${config.emojis.cross} You are banned from using Flipbets.`);
    }

    try {
      await command.execute(message, args, user);
      if (WEBSITE_CMDS.includes(commandName) || (command.aliases && command.aliases.some(a => WEBSITE_CMDS.includes(a)))) {
        // Website link added in command embeds via EmbedHelper.withWebsiteLink where applicable
      }
    } catch (error) {
      if (error.code === 11000) return;
      console.error(`Command error: ${error.message}`);
      message.reply(`${config.emojis.warning} An error occurred while executing that command.`);
    }
  }
};
