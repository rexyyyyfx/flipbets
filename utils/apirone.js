const axios = require('axios');
const config = require('../config');

const API_URL = config.apirone.apiUrl;
const ACCOUNT_ID = config.apirone.accountId;
const TRANSFER_KEY = config.apirone.transferKey;

class ApironeAPI {
  static isConfigured() {
    return !!(ACCOUNT_ID && TRANSFER_KEY);
  }

  static async request(endpoint, method = 'GET', data = null, query = {}) {
    if (!ACCOUNT_ID) throw new Error('Apirone account ID not configured');
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v));
    });
    const qs = params.toString();
    const url = `${API_URL}/accounts/${ACCOUNT_ID}${endpoint}${qs ? '?' + qs : ''}`;
    const headers = { 'Content-Type': 'application/json' };
    const options = { method, headers, url, timeout: 20000 };
    if (data) options.data = data;
    const response = await axios(options);
    if (response.data?.address?.startsWith('MOCK_')) {
      throw new Error('Apirone returned a sandbox/mock address — check APIRONE_ACCOUNT_ID');
    }
    return response.data;
  }

  static callbackUrl() {
    const base = config.apirone.callbackUrl || config.websiteUrl;
    if (!base || String(base).includes('localhost')) return null;
    return String(base).replace(/\/+$/, '') + '/api/webhook/apirone';
  }

  static async generateAddress(currency, data = {}) {
    const body = { currency };
    const callbackUrl = this.callbackUrl();
    if (callbackUrl) {
      body.callback = {
        method: 'POST',
        url: callbackUrl,
        data: { source: 'ezbet', ...data }
      };
    }
    const result = await this.request('/addresses', 'POST', body);
    const address = result?.address;
    if (!address) throw new Error('No address in Apirone response');
    return { address, currency, ...result };
  }

  static async getBalance(currency = 'ltc') {
    const result = await this.request('/balance', 'GET', null, { currency });
    if (Array.isArray(result?.balance)) {
      const entry = result.balance.find(b => b.currency === currency) || result.balance[0];
      return { currency, available: entry?.available || 0, total: entry?.total || 0, raw: result };
    }
    return { currency, available: result?.available || result?.balance || 0, total: result?.total || result?.balance || 0, raw: result };
  }

  static async createWithdrawal(currency, amount, address) {
    const satoshi = Math.floor(amount * 1e8);
    return this.request('/transfer', 'POST', {
      'transfer-key': TRANSFER_KEY,
      currency,
      destinations: [{ address, amount: String(satoshi) }],
      fee: 'normal'
    });
  }

  static getCurrencyRate(currency) {
    const rates = { ltc: 80 };
    return rates[currency] || 0;
  }

  static convertPointsToCrypto(points, currency) {
    const usd = points * config.conversionRate;
    return usd / this.getCurrencyRate(currency);
  }

  static convertCryptoToPoints(cryptoAmount, currency) {
    const usd = cryptoAmount * this.getCurrencyRate(currency);
    return Math.floor(usd / config.conversionRate);
  }

  static async getAddressTransactions(currency, address) {
    try {
      const result = await this.request(
        `/addresses/${address}/history`,
        'GET',
        null,
        { currency, limit: 50, offset: 0 }
      );
      const items = result?.txs || result?.items || result?.history || result?.transactions || [];
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }
}

module.exports = ApironeAPI;
