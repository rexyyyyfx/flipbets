const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const Game = require('../../models/Game');
const ProvablyFair = require('../../utils/provablyFair');
const EmbedHelper = require('../../utils/embedBuilder');
const GameImages = require('../../utils/gameImages');
const { betAgainRow } = require('../../utils/gameComponents');
const { parseBet } = require('../../utils/betParser');
const config = require('../../config');
const Logger = require('../../utils/logger');
const { applyWagerDecrement } = require('../../utils/wager');

const FLOORS = 9;
const HOUSE_EDGE = 0.96;
const MODES = {
  easy: { label: 'Easy', tiles: 4, bombs: 1, color: ButtonStyle.Success },
  medium: { label: 'Medium', tiles: 3, bombs: 1, color: ButtonStyle.Primary },
  hard: { label: 'Hard', tiles: 2, bombs: 1, color: ButtonStyle.Danger },
  expert: { label: 'Expert', tiles: 3, bombs: 2, color: ButtonStyle.Secondary }
};

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

function multiplierFor(mode, floor) {
  if (floor <= 0) return 1;
  const safeChance = (mode.tiles - mode.bombs) / mode.tiles;
  return Math.max(1.01, Math.floor((HOUSE_EDGE / Math.pow(safeChance, floor)) * 100) / 100);
}

function bombTiles(pf, mode, floor) {
  const pool = Array.from({ length: mode.tiles }, (_, i) => i + 1);
  const bombs = [];
  for (let i = 0; i < mode.bombs; i++) {
    const idx = Math.floor(pf.generateFloat(`tower:${floor}:${i}`) * pool.length);
    bombs.push(pool.splice(idx, 1)[0]);
  }
  return bombs;
}

function towerView({ user, bet, modeKey, floor, status, payout, lastPick, bombs, gameId }) {
  const mode = modeKey ? MODES[modeKey] : null;
  const currentMult = mode ? multiplierFor(mode, floor) : 1;
  const nextMult = mode && floor < FLOORS ? multiplierFor(mode, floor + 1) : currentMult;

  const embed = EmbedHelper.createDefault()
    .setTitle(`${config.emojis.gem} Towers`)
    .setDescription(
      status === 'select'
        ? 'Choose a difficulty to start climbing.'
        : status === 'lost'
          ? `BOOM. You hit a bomb on tile **${lastPick}**.`
          : status === 'won'
            ? `Cashed out **${fmt(payout)} pts**.`
            : `Pick one tile on floor **${floor + 1}/${FLOORS}**.`
    )
    .addFields(
      { name: 'Player', value: user.username, inline: true },
      { name: 'Bet', value: `${fmt(bet)} pts`, inline: true },
      { name: 'Difficulty', value: mode ? `${mode.label} (${mode.tiles} tiles, ${mode.bombs} bomb${mode.bombs > 1 ? 's' : ''})` : 'Choose below', inline: true },
      { name: 'Current', value: `${currentMult.toFixed(2)}x`, inline: true },
      { name: 'Next', value: mode && floor < FLOORS ? `${nextMult.toFixed(2)}x` : 'Max', inline: true }
    )
    .setColor(status === 'lost' ? config.colors.error : status === 'won' ? config.colors.success : config.colors.primary)
    .setImage('attachment://tower.png');

  if (gameId) embed.addFields({ name: 'Game ID', value: `\`${gameId}\``, inline: false });
  if (status === 'lost' && bombs?.length) embed.addFields({ name: 'Bombs', value: bombs.map(n => `#${n}`).join(', '), inline: true });
  return embed;
}

function difficultyRows(ownerId) {
  return [new ActionRowBuilder().addComponents(
    Object.entries(MODES).map(([key, mode]) =>
      new ButtonBuilder()
        .setCustomId(`tower_mode|${ownerId}|${key}`)
        .setLabel(mode.label)
        .setStyle(mode.color)
    )
  )];
}

function playRows(ownerId, gameId, mode, canCashout) {
  const row = new ActionRowBuilder();
  for (let i = 1; i <= mode.tiles; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tower_pick|${ownerId}|${gameId}|${i}`)
        .setLabel(String(i))
        .setStyle(ButtonStyle.Primary)
    );
  }
  if (canCashout) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tower_cash|${ownerId}|${gameId}`)
        .setLabel('Cash Out')
        .setStyle(ButtonStyle.Success)
    );
  }
  return [row];
}

function buildBombMap(pf, mode) {
  const map = {};
  for (let floor = 1; floor <= FLOORS; floor++) map[floor] = bombTiles(pf, mode, floor);
  return map;
}

function revealMapFromBombMap(bombMap) {
  return Array.from({ length: FLOORS }, (_, i) => ({
    floor: i + 1,
    bombs: bombMap?.[i + 1] || []
  }));
}

async function towerPayload(state, components) {
  const mode = state.modeKey ? MODES[state.modeKey] : null;
  const currentMult = mode ? multiplierFor(mode, state.floor) : 1;
  const nextMult = mode && state.floor < FLOORS ? multiplierFor(mode, state.floor + 1) : currentMult;
  const image = await GameImages.createTowersImage({
    mode: mode ? { ...mode, multiplier: currentMult, nextMultiplier: nextMult } : null,
    floor: state.floor,
    bet: state.bet,
    status: state.status,
    pickedTiles: state.pickedTiles,
    revealMap: state.revealMap,
    gameId: state.gameId,
    payout: state.payout
  });
  return {
    embeds: [towerView(state)],
    files: image ? [new AttachmentBuilder(image, { name: 'tower.png' })] : [],
    components
  };
}

module.exports = {
  name: 'towers',
  aliases: ['tower'],
  async execute(message, args, user) {
    const bet = parseBet(args[0], user.balance);
    if (!bet) {
      if (user.balance <= 0) return message.reply(`${config.emojis.warning} Invalid points - top up your balance to play.`);
      return message.reply(`${config.emojis.warning} Usage: \`.tower <amount|half|all>\``);
    }
    if (user.balance < bet) return message.reply(`${config.emojis.warning} Insufficient balance.`);

    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.clientSeed || ProvablyFair.generateClientSeed();
    const nonce = (user.gamesPlayed || 0) + 1;
    const pf = new ProvablyFair(serverSeed, clientSeed, nonce);
    const gameId = ProvablyFair.generateGameId();
    let modeKey = null;
    let floor = 0;
    let finished = false;
    let payout = 0;
    let lastBombs = [];
    let bombMap = null;
    const pickedTiles = [];

    const msg = await message.reply(await towerPayload({
      user, bet, status: 'select', floor, pickedTiles
    }, difficultyRows(message.author.id)));

    const collector = msg.createMessageComponentCollector({ time: 180000 });
    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'This Towers game belongs to the original player.', flags: MessageFlags.Ephemeral });
      }
      if (finished) return interaction.deferUpdate();

      const parts = interaction.customId.split('|');
      const action = parts[0];

      if (action === 'tower_mode') {
        modeKey = parts[2];
        const mode = MODES[modeKey];
        if (!mode) return interaction.deferUpdate();
        bombMap = buildBombMap(pf, mode);
        user.balance = Math.round((user.balance - bet) * 100) / 100;
        user.gamesPlayed = (user.gamesPlayed || 0) + 1;
        user.totalWagered = Math.round(((user.totalWagered || 0) + bet) * 100) / 100;
        applyWagerDecrement(user, bet);
        await user.save();
        return interaction.update(await towerPayload({
          user, bet, modeKey, floor, status: 'playing', gameId, pickedTiles
        }, playRows(message.author.id, gameId, mode, false)));
      }

      if (!modeKey) return interaction.deferUpdate();
      const mode = MODES[modeKey];

      if (action === 'tower_cash') {
        finished = true;
        const mult = multiplierFor(mode, floor);
        payout = Math.floor(bet * mult);
        user.balance = Math.round((user.balance + payout) * 100) / 100;
        user.wins = (user.wins || 0) + 1;
        applyWagerDecrement(user, bet);
        await user.save();
        await Game.create({
          gameId, userId: user.userId, username: user.username,
          gameType: 'Towers', betAmount: bet, payout, multiplier: mult,
          result: 'win', serverSeed, clientSeed, nonce,
          details: { difficulty: modeKey, floor, picks: pickedTiles, bombMap }
        });
        Logger.game(user.userId, 'Towers', bet, payout);
        collector.stop();
        return interaction.update(await towerPayload({
          user, bet, modeKey, floor, status: 'won', payout, gameId, pickedTiles, revealMap: revealMapFromBombMap(bombMap)
        }, [betAgainRow('towers', [bet], message.author.id)]));
      }

      if (action === 'tower_pick') {
        const pick = Number(parts[3]);
        const currentFloor = floor + 1;
        const bombs = bombMap?.[currentFloor] || bombTiles(pf, mode, currentFloor);
        lastBombs = bombs;
        if (bombs.includes(pick)) {
          finished = true;
          user.losses = (user.losses || 0) + 1;
          applyWagerDecrement(user, bet);
          await user.save();
          await Game.create({
            gameId, userId: user.userId, username: user.username,
            gameType: 'Towers', betAmount: bet, payout: 0, multiplier: 0,
            result: 'lose', serverSeed, clientSeed, nonce,
            details: { difficulty: modeKey, floor: currentFloor, pick, bombs, picks: pickedTiles, bombMap }
          });
          Logger.game(user.userId, 'Towers', bet, 0);
          collector.stop();
          return interaction.update(await towerPayload({
            user, bet, modeKey, floor, status: 'lost', lastPick: pick, bombs: lastBombs,
            gameId, pickedTiles, revealMap: revealMapFromBombMap(bombMap)
          }, [betAgainRow('towers', [bet], message.author.id)]));
        }

        floor += 1;
        pickedTiles.push({ floor, pick, bombs });
        if (floor >= FLOORS) {
          finished = true;
          const mult = multiplierFor(mode, floor);
          payout = Math.floor(bet * mult);
          user.balance = Math.round((user.balance + payout) * 100) / 100;
          user.wins = (user.wins || 0) + 1;
          applyWagerDecrement(user, bet);
          await user.save();
          await Game.create({
            gameId, userId: user.userId, username: user.username,
            gameType: 'Towers', betAmount: bet, payout, multiplier: mult,
            result: 'win', serverSeed, clientSeed, nonce,
            details: { difficulty: modeKey, floor, autoCashout: true, picks: pickedTiles, bombMap }
          });
          Logger.game(user.userId, 'Towers', bet, payout);
          collector.stop();
          return interaction.update(await towerPayload({
            user, bet, modeKey, floor, status: 'won', payout, gameId, pickedTiles, revealMap: revealMapFromBombMap(bombMap)
          }, [betAgainRow('towers', [bet], message.author.id)]));
        }

        return interaction.update(await towerPayload({
          user, bet, modeKey, floor, status: 'playing', lastPick: pick, gameId, pickedTiles
        }, playRows(message.author.id, gameId, mode, true)));
      }
    });

    collector.on('end', async () => {
      if (!finished && modeKey) {
        finished = true;
        user.losses = (user.losses || 0) + 1;
        applyWagerDecrement(user, bet);
        await user.save().catch(() => {});
        await Game.create({
          gameId, userId: user.userId, username: user.username,
          gameType: 'Towers', betAmount: bet, payout: 0, multiplier: 0,
          result: 'lose', serverSeed, clientSeed, nonce,
          details: { difficulty: modeKey, floor, expired: true, bombMap }
        }).catch(() => {});
        msg.edit({ components: [] }).catch(() => {});
      } else if (!finished) {
        msg.edit({ components: [] }).catch(() => {});
      }
    });
  }
};
