const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Game = require('../models/Game');
const User = require('../models/User');
const EmbedHelper = require('../utils/embedBuilder');
const Ranks = require('../utils/ranks');
const config = require('../config');

const WINDOWS = {
  daily: { label: 'Daily', ms: 24 * 60 * 60 * 1000 },
  weekly: { label: 'Weekly', ms: 7 * 24 * 60 * 60 * 1000 },
  monthly: { label: 'Monthly', ms: 30 * 24 * 60 * 60 * 1000 }
};

function fmtPts(value) {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function windowStart(key) {
  return new Date(Date.now() - (WINDOWS[key]?.ms || WINDOWS.daily.ms));
}

async function loadEntries(key) {
  const rows = await Game.aggregate([
    { $match: { createdAt: { $gte: windowStart(key) } } },
    { $group: { _id: '$userId', username: { $last: '$username' }, wagered: { $sum: '$betAmount' }, games: { $sum: 1 } } },
    { $sort: { wagered: -1 } },
    { $limit: 10 }
  ]);

  if (!rows.length && key === 'monthly') {
    const users = await User.find().sort({ totalWagered: -1 }).limit(10).lean();
    return users.map(u => ({ _id: u.userId, username: u.username, wagered: u.totalWagered || 0, games: u.gamesPlayed || 0 }));
  }
  return rows;
}

async function leaderboardEmbed(key) {
  const rows = await loadEntries(key);
  const title = WINDOWS[key]?.label || 'Daily';
  const medals = ['#1', '#2', '#3'];
  const lines = rows.length ? rows.map((u, i) => {
    const { rank } = Ranks.getRank(u.wagered || 0);
    const name = String(u.username || 'Unknown').slice(0, 18);
    return `**${medals[i] || '#' + (i + 1)}** ${rank?.emoji || ''} **${name}** - **${fmtPts(u.wagered)} pts** wagered (${u.games} games)`;
  }).join('\n') : 'No wagers in this period yet.';

  return EmbedHelper.createDefault()
    .setTitle(`${config.emojis.highroller} ${title} Wager Leaderboard`)
    .setDescription(lines)
    .setColor(config.colors.gold)
    .setFooter({ text: 'EzBet - leaderboard ranks by points wagered, not balance' })
    .setTimestamp();
}

function row(active) {
  return new ActionRowBuilder().addComponents(
    Object.entries(WINDOWS).map(([key, data]) =>
      new ButtonBuilder()
        .setCustomId(`lb_${key}`)
        .setLabel(data.label)
        .setStyle(key === active ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  async execute(message) {
    let active = 'daily';
    const msg = await message.reply({ embeds: [await leaderboardEmbed(active)], components: [row(active)] });
    const collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'This leaderboard menu belongs to the original requester.', flags: MessageFlags.Ephemeral });
      }
      active = interaction.customId.replace('lb_', '');
      await interaction.update({ embeds: [await leaderboardEmbed(active)], components: [row(active)] });
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
  }
};
