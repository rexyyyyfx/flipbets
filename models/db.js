const mongoose = require('mongoose');
const dns = require('dns');
const config = require('../config');
const Logger = require('../utils/logger');

async function connectDB() {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    Logger.info('DNS set to Google DNS (8.8.8.8)');

    const uri = config.mongoURI;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
      tlsAllowInvalidCertificates: true
    });
    Logger.success('Connected to MongoDB');
  } catch (error) {
    Logger.error(`MongoDB connection error: ${error.message}`);
    Logger.info('Trying alternative connection with hardcoded hosts...');
    try {
      const altUri = 'mongodb://rexyyfx:Jaat9719@ac-kpnd4bo-shard-00-00.q7ekhuh.mongodb.net:27017,ac-kpnd4bo-shard-00-01.q7ekhuh.mongodb.net:27017,ac-kpnd4bo-shard-00-02.q7ekhuh.mongodb.net:27017/flipbets?ssl=true&replicaSet=atlas-tucnrr-shard-0&retryWrites=true&w=majority&authSource=admin';
      await mongoose.connect(altUri, { serverSelectionTimeoutMS: 15000, family: 4, tlsAllowInvalidCertificates: true });
      Logger.success('Connected to MongoDB (via direct hosts)');
    } catch (altError) {
      Logger.error(`Direct connection also failed: ${altError.message}`);
      Logger.error('Check: 1) IP whitelisted in Atlas 2) Correct username/password 3) Network not blocking');
      process.exit(1);
    }
  }
}

module.exports = { connectDB };
