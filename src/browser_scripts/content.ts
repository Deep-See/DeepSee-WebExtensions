/**
 *  Copyright 2019 The Adaptive Web. All Rights Reserved.
 * 
 *  Licensed under the Mozilla Public License 2.0 (the "License"). 
 *  You may not use this file except in compliance with the License.
 *  A copy of the License is located at
 *  
 *      https://www.mozilla.org/en-US/MPL/2.0/
 *  
 *  or in the "license" file accompanying this file. This file is distributed 
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either 
 *  express or implied. See the License for the specific language governing 
 *  permissions and limitations under the License.
 */
import { Adapter, XHROptions, IAdapterContext } from "adaptiveweb";
import { sendMessage, validateOrigin, encodeBlob } from "./util";
import 'adaptiveweb/dist/reporting';

(function() {

    if (validateOrigin(location.href)) {
        window.postMessage({ message: 'initAdaptiveWebPlugin', reply: true }, '*');
    }

    /**
     * Handle messages from page
     */
    window.addEventListener('message', event => {
        if (event.data.reply) return;
        if (event.source != window) return;
        if (!validateOrigin(event.origin)) {
            if (event.data && event.data.messageId !== undefined) 
                reply(event.data.messageId, 'Request sent from disallowed origin: ' + event.origin, true);
            return;
        }

        let { messageId, bundle } = event.data;
        if (messageId === undefined || bundle === undefined) return; // This message probably isn't for us
        let { message, data } = bundle;
        sendMessage(message, data)
            .then(res => {
                reply(messageId, res);
            }, err => {
                reply(messageId, err, true);
            });
    });

    /**
     * Routes AdapterContext calls through the background script
     */
    class ProxyAdapterContext implements IAdapterContext {
        adapter: Adapter;
        constructor(adapter: Adapter) {
            this.adapter = adapter;
        }

        request(url: string, options: XHROptions): Promise<any> {
            if (options.data && options.data instanceof Blob) options.data = encodeBlob(options.data);
            return sendMessage('request', { id: this.adapter.id, args: [url, options] });
        }

        getPreferences(): Promise<any> {
            return new Promise<any>((resolve, reject) => {
                sendMessage('getPreferences', { id: this.adapter.id }).then((message) => {
                    resolve(message);
                });
            });
        }
    }

    /**
     * Callback for executing the adapters
     * @param adapters the adapters to execute
     */
    function executeAdapters(adapters: Adapter[]) {
        adapters.forEach(adapter => {
            adapter.execute(new ProxyAdapterContext(adapter));
        });
    }

    sendMessage('init');

    // Fetch the adapters from the
    sendMessage('requestAdapters')
        .then(rawAdapters => {
            let adapters: Adapter[] = [];
            (rawAdapters || []).forEach((raw: any) => {
                adapters.push(Adapter.fromObject(raw));
            });
            return adapters;
        }, err => {
            throw new Error(err);
        })
        .then(adapters => {
            executeAdapters(adapters);
        });

    /**
     * Replies to a message
     * @param messageId the message ID to reply to
     * @param bundle the bundle to send with the reply
     * @param isError denotes if this is an error or not
     */
    function reply(messageId: Number, bundle: any, isError = false) {
        window.postMessage({ messageId, bundle, isError, reply: true }, '*');
    }

})();