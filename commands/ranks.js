const { AttachmentBuilder } = require('discord.js');
const Ranks = require('../utils/ranks');
const EmbedHelper = require('../utils/embedBuilder');
const config = require('../config');

let canvasModule = null;
try { canvasModule = require('@napi-rs/canvas'); } catch {}

const RANK_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2', '#00d4ff', '#50C878', '#E0115F', '#9b59b6', '#4fd1ff'];

module.exports = {
  name: 'ranks',
  aliases: ['rankings'],
  async execute(message) {
    const allRanks = Ranks.getAll();
    let buffer = null;

    if (canvasModule) {
      const { createCanvas } = canvasModule;
      const rowH = 56;
      const height = 70 + allRanks.length * rowH;
      const canvas = createCanvas(520, Math.max(320, height));
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 520, height);
      grad.addColorStop(0, '#0d1520');
      grad.addColorStop(1, '#1a2744');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 520, height);

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Rank System', 260, 42);

      allRanks.forEach((r, i) => {
        const y = 68 + i * rowH;
        const color = RANK_COLORS[i] || '#FFD700';

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.roundRect(20, y - 18, 480, rowH - 8, 8);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(r.name, 36, y + 2);

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '13px Arial';
        ctx.fillText(`$${(r.wagerReq * 0.01).toFixed(0)} wagered`, 36, y + 22);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`+${r.reward} pts`, 490, y + 10);
      });

      buffer = canvas.toBuffer('image/png');
    }

    const lines = allRanks.map(r =>
      `${r.emoji} **${r.name}** — Wager **$${(r.wagerReq * 0.01).toFixed(0)}** → Reward **${r.reward} pts**`
    );

    const embed = EmbedHelper.createDefault()
      .setTitle(`${config.emojis.highroller} Rank System`)
      .setDescription(lines.join('\n'))
      .setColor(config.colors.gold)
      .setImage(buffer ? 'attachment://ranks.png' : null);

    EmbedHelper.withWebsiteLink(embed);
    const files = buffer ? [new AttachmentBuilder(buffer, { name: 'ranks.png' })] : [];
    message.reply({ embeds: [embed], files });
  }
};
