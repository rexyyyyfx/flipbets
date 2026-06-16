const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  AttachmentBuilder
} = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const ProvablyFair = require('./provablyFair');
const EmbedHelper = require('./embedBuilder');
const GameImages = require('./gameImages');
const config = require('../config');

const CRASH_CHANNEL_ID = '1511925644613779558';
const BETTING_SECONDS = 10;
const TICK_MS = 1000;

let started = false;
let clientRef = null;
let currentRound = null;
const lastCrashes = [];
const historyMessages = [];

function roundPoints(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function fmt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  const parts = Math.round(n * 100) / 100 + '';
  const x = parts.split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return x.join('.');
}

function roundEmbed(round, phase, secondsLeft = 0) {
  const bets = [...round.bets.values()];
  const betLines = bets.length
    ? bets.map(b => `<@${b.userId}> - ${fmt(b.amount)} pts${b.cashedOut ? ` @ ${b.cashoutMult.toFixed(2)}x` : ''}`).slice(0, 12).join('\n')
    : 'No bets yet.';
  const history = lastCrashes.length ? lastCrashes.slice(0, 5).map(x => `${x.toFixed(2)}x`).join('  ') : 'No history yet.';

  const statusText = phase === 'betting'
    ? `Betting closes in **${secondsLeft}s**`
    : phase === 'flying'
      ? `Flying at **${round.currentMult.toFixed(2)}x**`
      : `Crashed at **${round.crashPoint.toFixed(2)}x**`;

  return EmbedHelper.createDefault()
    .setTitle(`🚀 Crash - Round ${round.id}`)
    .setColor(phase === 'crashed' ? config.colors.error : phase === 'flying' ? config.colors.success : config.colors.primary)
    .addFields(
      { name: 'Status', value: statusText, inline: false },
      { name: `${config.emojis.money} Bets`, value: betLines, inline: false },
      { name: '🔥 Last Crashes', value: history, inline: false }
    );
}

function bettingRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crash_place').setLabel('Place Bet').setStyle(ButtonStyle.Success)
  );
}

function flyingRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crash_cashout').setLabel('Cash Out').setStyle(ButtonStyle.Primary)
  );
}

async function updateRoundMessage(phase, secondsLeft = 0, components = []) {
  const msg = currentRound?.message;
  if (!msg) return;
  const payload = { embeds: [roundEmbed(currentRound, phase, secondsLeft)], components };
  const buf = await GameImages.createCrashImage(
    currentRound?.crashPoint || 0,
    currentRound?.currentMult || 1,
    false, 'EzBet',
    currentRound?.id || '00000000',
    phase, secondsLeft, [...lastCrashes]
  );
  if (buf) payload.files = [new AttachmentBuilder(buf, { name: 'crash.png' })];
  await msg.edit(payload).catch(() => {});
}

async function sendCrashMessage() {
  const channel = currentRound.message.channel;
  if (!channel) return;

  const buf = await GameImages.createCrashImage(
    currentRound.crashPoint, currentRound.crashPoint, false, 'EzBet', currentRound.id,
    'crashed', 0, [...lastCrashes]
  );
  const embed = EmbedHelper.createDefault()
    .setTitle(`🚀 Crash - ${currentRound.crashPoint.toFixed(2)}x`)
    .setDescription(`Round \`${currentRound.id}\` crashed!`)
    .setColor(config.colors.error)
    .addFields(
      { name: 'Game ID', value: `\`${currentRound.id}\``, inline: true },
      { name: 'Crashed At', value: `**${currentRound.crashPoint.toFixed(2)}x**`, inline: true },
      { name: 'Total Bets', value: `${currentRound.bets.size}`, inline: true }
    )
    .setImage(buf ? 'attachment://crash.png' : null);
  const payload = { embeds: [embed] };
  if (buf) payload.files = [new AttachmentBuilder(buf, { name: 'crash.png' })];

  const msg = await channel.send(payload).catch(() => null);
  if (!msg) return;
  historyMessages.push(msg);
  if (historyMessages.length > 5) {
    const old = historyMessages.shift();
    await old.delete().catch(() => {});
  }
}

function makeCrashPoint() {
  const serverSeed = ProvablyFair.generateServerSeed();
  const clientSeed = ProvablyFair.generateClientSeed();
  const pf = new ProvablyFair(serverSeed, clientSeed, Date.now());
  return Math.max(1.01, Math.min(50, pf.generateLimboMultiplier()));
}

async function settleLosses(round) {
  for (const bet of round.bets.values()) {
    if (bet.cashedOut) continue;
    const user = await User.findOne({ userId: bet.userId });
    if (user) {
      user.losses++;
      await user.save();
    }
    await Game.findOneAndUpdate(
      { gameId: bet.gameId },
      {
        result: 'lose',
        payout: 0,
        multiplier: 0,
        details: { ...bet.details, crashPoint: round.crashPoint }
      }
    );
  }
}

async function runRound(channel) {
  const round = {
    id: ProvablyFair.generateGameId(),
    crashPoint: makeCrashPoint(),
    currentMult: 1,
    bets: new Map(),
    acceptingBets: true,
    flying: false,
    message: null
  };
  currentRound = round;

  const embed = roundEmbed(round, 'betting', BETTING_SECONDS);
  const buf = await GameImages.createCrashImage(0, 1, false, 'EzBet', round.id, 'betting', BETTING_SECONDS, [...lastCrashes]);
  const payload = { embeds: [embed], components: [bettingRow()] };
  if (buf) payload.files = [new AttachmentBuilder(buf, { name: 'crash.png' })];
  round.message = await channel.send(payload).catch(() => null);
  if (!round.message) return;

  for (let seconds = BETTING_SECONDS - 1; seconds >= 0; seconds--) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await updateRoundMessage('betting', seconds, [bettingRow()]);
  }

  round.acceptingBets = false;
  round.flying = true;
  await updateRoundMessage('flying', 0, [flyingRow()]);

  while (round.currentMult < round.crashPoint) {
    await new Promise(resolve => setTimeout(resolve, TICK_MS));
    round.currentMult = roundPoints(round.currentMult + 0.08 + Math.pow(round.currentMult, 1.12) * 0.04);
    if (round.currentMult >= round.crashPoint) break;
    await updateRoundMessage('flying', 0, [flyingRow()]);
  }

  round.currentMult = round.crashPoint;
  round.flying = false;
  lastCrashes.unshift(round.crashPoint);
  while (lastCrashes.length > 5) lastCrashes.pop();
  await settleLosses(round);
  await sendCrashMessage();
  // delete the round's bet panel message
  if (round.message) await round.message.delete().catch(() => {});
}

async function start(client) {
  if (started) return;
  started = true;
  clientRef = client;
  const channel = await client.channels.fetch(CRASH_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  (async () => {
    while (true) {
      try {
        await runRound(channel);
      } catch (error) {
        console.error(`Crash loop error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  })();
}

async function handleInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === 'crash_place') {
    if (!currentRound?.acceptingBets) return interaction.reply({ content: 'Betting is closed for this round.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('crash_bet_modal').setTitle('Place Crash Bet');
    const amount = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Amount')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('10');
    modal.addComponents(new ActionRowBuilder().addComponents(amount));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'crash_bet_modal') {
    if (!currentRound?.acceptingBets) return interaction.reply({ content: 'Betting is closed for this round.', flags: MessageFlags.Ephemeral });
    const amount = roundPoints(parseFloat(interaction.fields.getTextInputValue('amount')));
    if (!Number.isFinite(amount) || amount <= 0) return interaction.reply({ content: 'Invalid amount.', flags: MessageFlags.Ephemeral });
    if (currentRound.bets.has(interaction.user.id)) return interaction.reply({ content: 'You already placed a bet this round.', flags: MessageFlags.Ephemeral });

    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) user = await User.create({ userId: interaction.user.id, username: interaction.user.username });
    if (user.balance < amount) return interaction.reply({ content: `Insufficient balance. You have ${fmt(user.balance)} pts.`, flags: MessageFlags.Ephemeral });

    user.balance = roundPoints(user.balance - amount);
    user.gamesPlayed++;
    user.totalWagered = roundPoints((user.totalWagered || 0) + amount);
    await user.save();

    const gameId = ProvablyFair.generateGameId();
    await Game.create({
      gameId,
      userId: user.userId,
      username: user.username,
      gameType: 'Crash',
      betAmount: amount,
      payout: 0,
      multiplier: 0,
      result: 'pending',
      serverSeed: ProvablyFair.generateServerSeed(),
      clientSeed: ProvablyFair.generateClientSeed(),
      nonce: user.gamesPlayed,
      details: { roundId: currentRound.id }
    });

    currentRound.bets.set(interaction.user.id, {
      userId: interaction.user.id,
      username: interaction.user.username,
      amount,
      gameId,
      cashedOut: false,
      cashoutMult: 0,
      details: { roundId: currentRound.id }
    });
    await updateRoundMessage('betting', currentRound._remaining || 0, [bettingRow()]);
    return interaction.reply({ content: `Bet placed: ${fmt(amount)} pts.`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.isButton() && interaction.customId === 'crash_cashout') {
    if (!currentRound?.flying) return interaction.reply({ content: 'There is no active crash round.', flags: MessageFlags.Ephemeral });
    const bet = currentRound.bets.get(interaction.user.id);
    if (!bet) return interaction.reply({ content: 'You do not have a bet in this round.', flags: MessageFlags.Ephemeral });
    if (bet.cashedOut) return interaction.reply({ content: 'You already cashed out.', flags: MessageFlags.Ephemeral });

    bet.cashedOut = true;
    bet.cashoutMult = currentRound.currentMult;
    const payout = roundPoints(bet.amount * currentRound.currentMult);
    const user = await User.findOne({ userId: bet.userId });
    if (user) {
      user.balance = roundPoints(user.balance + payout);
      user.wins++;
      await user.save();
    }
    await Game.findOneAndUpdate(
      { gameId: bet.gameId },
      {
        result: 'win',
        payout,
        multiplier: currentRound.currentMult,
        details: { ...bet.details, crashPoint: currentRound.crashPoint, cashoutAt: currentRound.currentMult }
      }
    );
    await updateRoundMessage('flying', 0, [flyingRow()]);
    return interaction.reply({ content: `Cashed out at ${currentRound.currentMult.toFixed(2)}x for ${fmt(payout)} pts.`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { start, handleInteraction, CRASH_CHANNEL_ID };
