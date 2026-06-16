const { AttachmentBuilder } = require('discord.js');
const Ranks = require('../utils/ranks');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

let canvasModule = null;
try { canvasModule = require('@napi-rs/canvas'); } catch {}

const COLORS = ['#b87932', '#c8d0d8', '#f5c542', '#e8edf5', '#45b7ff', '#40d98c', '#ff4d7d', '#9b7cff', '#f8fafc'];

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rankColor(rank) {
  const idx = Ranks.getAll().findIndex(r => r.name === rank?.name);
  return COLORS[idx] || '#23e078';
}

module.exports = {
  name: 'rank',
  aliases: ['r'],
  async execute(message, args, user) {
    const totalWagered = user.totalWagered || 0;
    const { rank, next, progress } = Ranks.getRank(totalWagered);
    const color = rankColor(rank);
    let buffer = null;

    if (canvasModule && rank) {
      const { createCanvas } = canvasModule;
      const canvas = createCanvas(760, 360);
      const ctx = canvas.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, 760, 360);
      bg.addColorStop(0, '#070b10');
      bg.addColorStop(1, '#111923');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 760, 360);

      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      for (let x = 0; x < 760; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 160, 360);
        ctx.stroke();
      }

      rr(ctx, 34, 34, 692, 292, 20);
      ctx.fillStyle = 'rgba(20,33,44,.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(114, 132, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#071017';
      ctx.font = 'italic bold 58px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', 114, 139);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(user.username || 'Player', 192, 92);
      ctx.fillStyle = color;
      ctx.font = 'bold 42px Arial';
      ctx.fillText(rank.name, 192, 142);
      ctx.fillStyle = 'rgba(255,255,255,.64)';
      ctx.font = '16px Arial';
      ctx.fillText(`${fmt(totalWagered)} pts wagered`, 192, 176);

      const barX = 70, barY = 238, barW = 620, barH = 24;
      rr(ctx, barX, barY, barW, barH, 12);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fill();
      const pct = Math.min(100, Math.max(0, progress || 0));
      rr(ctx, barX, barY, Math.max(8, barW * pct / 100), barH, 12);
      const fill = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      fill.addColorStop(0, color);
      fill.addColorStop(1, '#23e078');
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${pct.toFixed(1)}%`, barX + barW / 2, barY + 17);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = '15px Arial';
      if (next) {
        ctx.fillText(`${fmt(Math.max(0, next.wagerReq - totalWagered))} pts to ${next.name}`, 70, 292);
        ctx.textAlign = 'right';
        ctx.fillText(`Next reward: ${fmt(next.reward)} pts`, 690, 292);
      } else {
        ctx.fillText('Max rank reached', 70, 292);
      }

      buffer = canvas.toBuffer('image/png');
    }

    const embed = EmbedHelper.createDefault()
      .setTitle(`${rank ? rank.emoji + ' ' : ''}${user.username}'s Rank`)
      .setDescription(rank
        ? `Rank: **${rank.name}**\nWagered: **${fmt(totalWagered)} pts**${next ? `\nNext: **${fmt(Math.max(0, next.wagerReq - totalWagered))} pts** to ${next.name}` : '\nMax rank reached.'}`
        : 'No rank yet.')
      .setColor(config.colors.info)
      .setImage(buffer ? 'attachment://rank.png' : null);

    const files = buffer ? [new AttachmentBuilder(buffer, { name: 'rank.png' })] : [];
    message.reply({ embeds: [embed], files });
  }
};
