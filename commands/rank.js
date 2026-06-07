const { AttachmentBuilder } = require('discord.js');
const Ranks = require('../utils/ranks');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

let canvasModule = null;
try { canvasModule = require('@napi-rs/canvas'); } catch {}

const RANK_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2', '#00d4ff', '#50C878', '#E0115F', '#9b59b6', '#4fd1ff'];

module.exports = {
  name: 'rank',
  aliases: ['r'],
  async execute(message, args, user) {
    const totalWagered = user.totalWagered || 0;
    const { rank, next, progress } = Ranks.getRank(totalWagered);

    let buffer = null;
    if (canvasModule && rank) {
      const { createCanvas } = canvasModule;
      const canvas = createCanvas(500, 300);
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 500, 300);
      grad.addColorStop(0, '#0d1520');
      grad.addColorStop(1, '#1a2744');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 500, 300);

      const idx = Ranks.getAll().findIndex(r => r.name === rank.name);
      const color = RANK_COLORS[idx] || '#FFD700';

      ctx.fillStyle = color;
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(rank.name, 250, 70);

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '15px Arial';
      ctx.fillText(`Total Wagered: $${(totalWagered * 0.01).toFixed(2)} (${totalWagered.toLocaleString()} pts)`, 250, 105);

      if (next) {
        const barX = 50, barY = 140, barW = 400, barH = 22;
        const pct = Math.min(100, Math.max(0, progress));

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 11);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        const fillW = Math.max(4, Math.round(barW * pct / 100));
        ctx.roundRect(barX, barY, Math.min(fillW, barW), barH, 11);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(`${pct.toFixed(1)}%`, 250, barY + 15);

        const ptsNeeded = next.wagerReq - totalWagered;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '14px Arial';
        ctx.fillText(`${ptsNeeded.toLocaleString()} pts ($${(ptsNeeded * 0.01).toFixed(2)}) to ${next.name}`, 250, 195);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '12px Arial';
        ctx.fillText(`Reward for reaching ${next.name}: +${next.reward} pts`, 250, 220);
      } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('MAX RANK — Congratulations!', 250, 180);
      }

      buffer = canvas.toBuffer('image/png');
    }

    const embed = EmbedHelper.createDefault()
      .setTitle(`${rank ? rank.emoji + ' ' : ''}${rank ? rank.name : 'Unranked'} — ${message.author.username}`)
      .setDescription(rank
        ? `Total Wagered: **$${(totalWagered * 0.01).toFixed(2)}** (${totalWagered.toLocaleString()} pts)`
        : `No rank yet. Wager **$${((Ranks.getAll()[0].wagerReq - totalWagered) * 0.01).toFixed(2)}** more.`)
      .setColor(config.colors.info)
      .setImage(buffer ? 'attachment://rank.png' : null);

    EmbedHelper.withWebsiteLink(embed);
    const files = buffer ? [new AttachmentBuilder(buffer, { name: 'rank.png' })] : [];
    message.reply({ embeds: [embed], files });
  }
};
