const config = require('../config');

function sendPublic(client, payload) {
  const ids = config.publicBetsChannels && config.publicBetsChannels.length
    ? config.publicBetsChannels
    : (config.publicBetsChannel ? [config.publicBetsChannel] : []);
  for (const id of ids) {
    const ch = client.channels.cache.get(id);
    if (ch && ch.isTextBased()) ch.send(payload).catch(() => {});
  }
}

module.exports = { sendPublic };
