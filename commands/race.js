const WagerRace = require('../models/WagerRace');
const config = require('../config');
const { EmbedBuilder } = require('discord.js');
const EmbedHelper = require('../utils/embedBuilder');

module.exports = {
  name: 'race',
  aliases: ['wragerrace', 'wrace'],
  description: 'Show the current weekly wager race',
  async execute(message, args, client) {
    try {
      const race = await WagerRace.getActive();
      const sorted = [...(race.entries || [])].sort((a, b) => b.wagered - a.wagered);
      const top = sorted.slice(0, 10);
      const totalDistribution = (race.distribution || []).reduce((s, v) => s + v, 0);
      const enriched = top.map((e, i) => {
        const pct = (race.distribution[i] || 0) / Math.max(1, totalDistribution);
        return { ...(e.toObject ? e.toObject() : e), prize: Math.floor(race.prizePool * pct) };
      });

      const end = new Date(race.endAt).getTime();
      const diff = end - Date.now();
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const pad = (n) => (n < 10 ? '0' : '') + n;
      const countdown = (d > 0 ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);

      const totalWagered = sorted.reduce((s, e) => s + e.wagered, 0);
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🏆 ' + race.title)
        .setDescription('Bet the most this week to win the prize pool!')
        .addFields(
          { name: 'Prize Pool', value: '`' + (race.prizePool * 0.01).toFixed(2) + '`', inline: true },
          { name: 'Players', value: '`' + race.entries.length + '`', inline: true },
          { name: 'Ends In', value: '`' + countdown + '`', inline: true },
          { name: 'Total Wagered', value: '`' + (totalWagered * 0.01).toFixed(2) + '`', inline: true }
        )
        .setFooter({ text: 'Wager counted from all games • Race resets weekly' })
        .setTimestamp();

      if (enriched.length) {
        embed.addFields({
          name: '🏅 Top 10',
          value: enriched.map((e, i) => `**${i + 1}.** ${e.username || 'Player'} — ${(e.wagered * 0.01).toFixed(2)} pts • 🏆 ${(e.prize * 0.01).toFixed(2)}`).join('\n') || 'No entries yet'
        });
      } else {
        embed.addFields({ name: '🏅 Top 10', value: 'No entries yet — be the first to wager!' });
      }

      return message.reply({ embeds: [embed] });
    } catch (e) {
      console.error('race err', e);
      return message.reply({ embeds: [EmbedHelper.error('Failed to load wager race.', config.footerText)] });
    }
  }
};
