const LOG_CHANNEL_ID = '1516492539589562408';

let client = null;
const queue = [];
let ready = false;

function setClient(c) {
  client = c;
  ready = true;
  for (const item of queue.splice(0)) send(item);
}

async function send(payload) {
  if (!client) { queue.push(payload); return; }
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch && ch.isTextBased()) await ch.send(payload);
  } catch (e) { console.error('logChannel send error:', e.message); }
}

module.exports = { setClient, send };
