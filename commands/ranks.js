const { AttachmentBuilder } = require('discord.js');
const Ranks = require('../utils/ranks');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

let canvasModule = null;
try { canvasModule = require('@napi-rs/canvas'); } catch {}

const COLORS = ['#b87932', '#c8d0d8', '#f5c542', '#e8edf5', '#45b7ff', '#40d98c', '#ff4d7d', '#9b7cff', '#f8fafc'];

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
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

module.exports = {
  name: 'ranks',
  aliases: ['rankings'],
  async execute(message) {
    const allRanks = Ranks.getAll();
    let buffer = null;

    if (canvasModule) {
      const { createCanvas } = canvasModule;
      const canvas = createCanvas(820, 640);
      const ctx = canvas.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, 820, 640);
      bg.addColorStop(0, '#070b10');
      bg.addColorStop(1, '#111923');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 820, 640);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 34px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('EzBet Rank Ladder', 42, 58);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '15px Arial';
      ctx.fillText('Ranks are based on total points wagered.', 42, 86);

      allRanks.forEach((rank, i) => {
        const y = 116 + i * 56;
        const color = COLORS[i] || '#23e078';
        rr(ctx, 40, y, 740, 44, 10);
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.075)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(68, y + 22, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(rank.name, 96, y + 28);
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.font = '14px Arial';
        ctx.fillText(`${fmt(rank.wagerReq)} pts wagered`, 300, y + 28);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#23e078';
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`Reward ${fmt(rank.reward)} pts`, 756, y + 28);
      });

      buffer = canvas.toBuffer('image/png');
    }

    const lines = allRanks.map(r =>
      `${r.emoji} **${r.name}** - **${fmt(r.wagerReq)} pts wagered** - Reward **${fmt(r.reward)} pts**`
    );

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Rank Ladder`)
      .setDescription(lines.join('\n'))
      .setColor(config.colors.gold)
      .setImage(buffer ? 'attachment://ranks.png' : null);

    const files = buffer ? [new AttachmentBuilder(buffer, { name: 'ranks.png' })] : [];
    message.reply({ embeds: [embed], files });
  }
};
