console.log('Starting EzBet (Bot + Web in one process)...');
process.env.RUNNING_VIA_START = '1';

const path = require('path');
const root = __dirname;

function start(name) {
  console.log(`  → starting ${name}...`);
  try {
    require(path.join(root, name));
  } catch (e) {
    console.error(`Failed to start ${name}:`, e);
    if (name === 'web/server.js') process.exit(1);
  }
}

start('bot.js');
setTimeout(() => start('web/server.js'), 1500);

function shutdown(sig) {
  console.log(`\nReceived ${sig}, exiting...`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
