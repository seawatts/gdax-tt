"use strict";
/***************************************************************************************************************************
 * @license                                                                                                                *
 * Copyright 2017 Coinbase, Inc.                                                                                           *
 *                                                                                                                         *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance          *
 * with the License. You may obtain a copy of the License at                                                               *
 *                                                                                                                         *
 * http://www.apache.org/licenses/LICENSE-2.0                                                                              *
 *                                                                                                                         *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on     *
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the                      *
 * License for the specific language governing permissions and limitations under the License.                              *
 ***************************************************************************************************************************/
Object.defineProperty(exports, "__esModule", { value: true });
const BookBuilder_1 = require("../../lib/BookBuilder");
const types_1 = require("../../lib/types");
const Logger_1 = require("../../utils/Logger");
const utils_1 = require("../utils");
const request = require("superagent");
const querystring = require("querystring");
const crypto = require("crypto");
exports.GDAX_API_URL = 'https://api.gdax.com';
class GDAXExchangeAPI {
    constructor(options) {
        this.owner = 'GDAX';
        this._apiURL = options.apiUrl || exports.GDAX_API_URL;
        this.auth = options.auth;
        this.logger = options.logger || Logger_1.ConsoleLoggerFactory();
    }
    get apiURL() {
        return this._apiURL;
    }
    loadProducts() {
        const url = `${this.apiURL}/products`;
        return request.get(url)
            .accept('application/json')
            .then((res) => {
            if (res.status !== 200) {
                throw new Error('loadProducts did not get the expected response from the server. ' + res.body);
            }
            const products = res.body;
            return products.map((prod) => {
                return {
                    id: prod.id,
                    sourceId: prod.id,
                    baseCurrency: prod.base_currency,
                    quoteCurrency: prod.quote_currency,
                    baseMinSize: types_1.Big(prod.base_min_size),
                    baseMaxSize: types_1.Big(prod.base_max_size),
                    quoteIncrement: types_1.Big(prod.quote_increment),
                    sourceData: prod
                };
            });
        });
    }
    loadMidMarketPrice(product) {
        return this.loadTicker(product).then((ticker) => {
            if (!ticker || !ticker.bid || !ticker.ask) {
                throw new Error('Loading midmarket price failed because ticker data was incomplete or unavailable');
            }
            return ticker.ask.plus(ticker.bid).times(0.5);
        });
    }
    loadOrderbook(product) {
        return this.loadFullOrderbook(product);
    }
    loadFullOrderbook(product) {
        return this.loadGDAXOrderbook({ product: product, level: 3 }).then((body) => {
            return this.buildBook(body);
        });
    }
    loadGDAXOrderbook(options) {
        const url = `${this.apiURL}/products/${options.product}/book`;
        return request.get(url)
            .accept('application/json')
            .query({ level: options.level })
            .then((res) => {
            if (res.status !== 200) {
                throw new Error('loadOrderbook did not get the expected response from the server. ' + res.body);
            }
            const orders = res.body;
            if (!(orders.bids && orders.asks)) {
                throw new Error('loadOrderbook did not return an bids or asks: ' + res.body);
            }
            return res.body;
        }, (err) => {
            this.logger.log('error', `Error loading snapshot for ${options.product}`, err);
            return Promise.resolve(null);
        });
    }
    loadTicker(product) {
        const url = `${this.apiURL}/products/${product}/ticker`;
        return request.get(url)
            .accept('application/json')
            .then((res) => {
            if (res.status !== 200) {
                throw new Error('loadTicker did not get the expected response from the server. ' + res.body);
            }
            const ticker = res.body;
            return {
                productId: product,
                ask: ticker.ask ? types_1.Big(ticker.ask) : undefined,
                bid: ticker.bid ? types_1.Big(ticker.bid) : undefined,
                price: types_1.Big(ticker.price || 0),
                size: types_1.Big(ticker.size || 0),
                volume: types_1.Big(ticker.volume || 0),
                time: new Date(ticker.time || new Date()),
                trade_id: ticker.trade_id ? ticker.trade_id.toString() : '0'
            };
        });
    }
    aggregateBook(body) {
        const book = new BookBuilder_1.BookBuilder(this.logger);
        book.sequence = parseInt(body.sequence, 10);
        ['bids', 'asks'].forEach((side) => {
            let currentPrice;
            let order;
            const bookSide = side === 'bids' ? 'buy' : 'sell';
            body[side].forEach((bid) => {
                if (bid[0] !== currentPrice) {
                    // Set the price on the old level
                    if (order) {
                        book.add(order);
                    }
                    currentPrice = bid[0];
                    order = {
                        id: currentPrice,
                        price: types_1.Big(currentPrice),
                        side: bookSide,
                        size: types_1.ZERO
                    };
                }
                order.size = order.size.plus(bid[1]);
            });
            if (order) {
                book.add(order);
            }
        });
        return book;
    }
    // ----------------------------------- Authenticated API methods --------------------------------------------------//
    placeOrder(order) {
        const gdaxOrder = {
            product_id: order.productId,
            size: order.size,
            price: order.price,
            side: order.side,
            type: order.orderType,
            client_oid: order.clientId,
            post_only: order.postOnly,
            time_in_force: order.extra && order.extra.time_in_force,
            cancel_after: order.extra && order.extra.cancel_after,
            funds: order.funds
        };
        const apiCall = this.authCall('POST', '/orders', { body: gdaxOrder });
        return utils_1.handleResponse(apiCall, { order: order })
            .then((result) => {
            return GDAXOrderToOrder(result);
        }, (err) => {
            this.logger.log('error', 'Placing order failed', { order: order, reason: err.message });
            return Promise.reject(err);
        });
    }
    cancelOrder(id) {
        const apiCall = this.authCall('DELETE', `/orders/${id}`, {});
        return utils_1.handleResponse(apiCall, { order_id: id }).then((ids) => {
            return Promise.resolve(ids[0]);
        });
    }
    cancelAllOrders(product) {
        const apiCall = this.authCall('DELETE', `/orders`, {});
        const options = product ? { product_id: product } : null;
        return utils_1.handleResponse(apiCall, options).then((ids) => {
            return Promise.resolve(ids);
        });
    }
    loadOrder(id) {
        const apiCall = this.authCall('GET', `/orders/${id}`, {});
        return utils_1.handleResponse(apiCall, { order_id: id }).then((order) => {
            return GDAXOrderToOrder(order);
        });
    }
    loadAllOrders(product) {
        const self = this;
        let allOrders = [];
        const loop = (after) => {
            return self.loadNextOrders(product, after).then((result) => {
                const liveOrders = result.orders.map(GDAXOrderToOrder);
                allOrders = allOrders.concat(liveOrders);
                if (result.after) {
                    return loop(result.after);
                }
                else {
                    return allOrders;
                }
            });
        };
        return new Promise((resolve, reject) => {
            return loop(null).then((orders) => {
                return resolve(orders);
            }, reject);
        });
    }
    loadBalances() {
        const apiCall = this.authCall('GET', '/accounts', {});
        return utils_1.handleResponse(apiCall, {}).then((accounts) => {
            const balances = {};
            accounts.forEach((account) => {
                if (!balances[account.profile_id]) {
                    balances[account.profile_id] = {};
                }
                balances[account.profile_id][account.currency] = {
                    balance: types_1.Big(account.balance),
                    available: types_1.Big(account.available)
                };
            });
            return balances;
        });
    }
    authCall(method, path, opts) {
        return this.checkAuth().then(() => {
            method = method.toUpperCase();
            const url = `${this.apiURL}${path}`;
            let body = '';
            let req = request(method, url)
                .accept('application/json')
                .set('content-type', 'application/json');
            if (opts.body) {
                body = JSON.stringify(opts.body);
                req.send(body);
            }
            else if (opts.qs && Object.keys(opts.qs).length !== 0) {
                req.query(opts.qs);
                body = '?' + querystring.stringify(opts.qs);
            }
            const signature = this.getSignature(method, path, body);
            req.set(signature);
            if (opts.headers) {
                req = req.set(opts.headers);
            }
            return Promise.resolve(req);
        });
    }
    getSignature(method, relativeURI, body) {
        body = body || '';
        const timestamp = (Date.now() / 1000).toFixed(3);
        const what = timestamp + method + relativeURI + body;
        const key = Buffer.from(this.auth.secret, 'base64');
        const hmac = crypto.createHmac('sha256', key);
        const signature = hmac.update(what).digest('base64');
        return {
            'CB-ACCESS-KEY': this.auth.key,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'CB-ACCESS-PASSPHRASE': this.auth.passphrase
        };
    }
    checkAuth() {
        return new Promise((resolve, reject) => {
            if (this.auth === null) {
                return reject(new Error('You cannot make authenticated requests if a GDAXAuthConfig object was not provided to the GDAXExchangeAPI constructor'));
            }
            if (!(this.auth.key && this.auth.secret && this.auth.passphrase)) {
                return reject(new Error('You cannot make authenticated requests without providing all API credentials'));
            }
            return resolve();
        });
    }
    buildBook(body) {
        const book = new BookBuilder_1.BookBuilder(this.logger);
        book.sequence = parseInt(body.sequence, 10);
        ['bids', 'asks'].forEach((side) => {
            const bookSide = side === 'bids' ? 'buy' : 'sell';
            body[side].forEach((data) => {
                const order = {
                    id: data[2],
                    price: types_1.Big(data[0]),
                    side: bookSide,
                    size: types_1.Big(data[1])
                };
                book.add(order);
            });
        });
        return book;
    }
    loadNextOrders(product, after) {
        const qs = {
            status: ['open', 'pending', 'active']
        };
        if (product) {
            qs.product_id = product;
        }
        if (after) {
            qs.after = after;
        }
        return this.authCall('GET', '/orders', { qs: qs }).then((res) => {
            const cbAfter = res.header['cb-after'];
            const orders = res.body;
            return {
                after: cbAfter,
                orders: orders
            };
        });
    }
}
exports.GDAXExchangeAPI = GDAXExchangeAPI;
function GDAXOrderToOrder(order) {
    // this is actually the average price, since an order can me matched multiple times if it was a market order
    const size = types_1.Big(order.size);
    const price = types_1.Big(order.executed_value).div(size);
    return {
        price: price,
        size: size,
        side: order.side,
        id: order.id,
        time: new Date(order.created_at),
        productId: order.product_id,
        status: order.status,
        extra: order
    };
}
//# sourceMappingURL=GDAXExchangeAPI.js.map