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

import request = require('superagent');
import crypto = require('crypto');
import Response = request.Response;
import { ExchangeAuthConfig } from './AuthConfig';

/**
 * A generic API response handler.
 * @param req A superagent request object
 * @param meta
 * @returns {Promise<Response>}
 */
export async function handleResponse<T>(req: Promise<Response>, meta: any): Promise<T> {
    try {
        const res: Response = await req;
        if (res.status >= 200 && res.status < 300) {
            return res.body;
        }
        const err: any = new Error(res.body.message);
        err.details = res.body;
        throw err;
    } catch (err) {
        const reason: any = err.details.message;
        const error: any = Object.assign(new Error('An API request failed. ' + reason), meta);
        error.reason = reason;
        return error;
    }
}

export function getSignature(auth: ExchangeAuthConfig, payload: string, algorithm: string = 'sha256'): string {
    return crypto
        .createHmac(algorithm, auth.secret)
        .update(payload)
        .digest('hex');
}
