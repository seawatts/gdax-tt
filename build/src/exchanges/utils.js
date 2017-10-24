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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
class ExtendedError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.message = message;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error(message)).stack;
        }
    }
}
exports.ExtendedError = ExtendedError;
class RethrownError extends ExtendedError {
    constructor(message, error) {
        super(message);
        if (!error) {
            throw new Error('RethrownError requires a message and error');
        }
        this.original = error;
        this.newStack = this.stack;
        const messageLines = (this.message.match(/\n/g) || []).length + 1;
        this.stack = this.stack.split('\n').slice(0, messageLines + 1).join('\n') + '\n' +
            error.stack;
    }
}
exports.RethrownError = RethrownError;
/**
 * A generic API response handler.
 * @param req A superagent request object
 * @param meta
 * @returns {Promise<Response>}
 */
function handleResponse(req, meta) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield req;
            if (res.status >= 200 && res.status < 300) {
                return res.body;
            }
            const err = new Error(res.body.message);
            err.details = res.body;
            throw err;
        }
        catch (err) {
            err.meta = meta;
            const reason = err.response.body.message;
            throw new RethrownError(`An API request failed. HTTP: ${err.status} - ${reason}`, err);
        }
    });
}
exports.handleResponse = handleResponse;
function getSignature(auth, payload, algorithm = 'sha256') {
    return crypto
        .createHmac(algorithm, auth.secret)
        .update(payload)
        .digest('hex');
}
exports.getSignature = getSignature;
//# sourceMappingURL=utils.js.map