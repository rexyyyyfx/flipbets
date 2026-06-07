const chalk = {
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  blue: (t) => `\x1b[34m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`
};

class Logger {
  static info(message) {
    console.log(`${chalk.blue('[INFO]')} ${new Date().toLocaleString()} - ${message}`);
  }

  static success(message) {
    console.log(`${chalk.green('[OK]')} ${new Date().toLocaleString()} - ${message}`);
  }

  static warn(message) {
    console.log(`${chalk.yellow('[WARN]')} ${new Date().toLocaleString()} - ${message}`);
  }

  static error(message) {
    console.log(`${chalk.red('[ERROR]')} ${new Date().toLocaleString()} - ${message}`);
  }

  static game(userId, gameType, bet, payout) {
    console.log(`${chalk.cyan('[GAME]')} ${new Date().toLocaleString()} - User:${userId} Game:${gameType} Bet:${bet} Payout:${payout}`);
  }

  static economy(userId, type, amount) {
    console.log(`${chalk.yellow('[ECO]')} ${new Date().toLocaleString()} - User:${userId} Type:${type} Amount:${amount}`);
  }
}

module.exports = Logger;
