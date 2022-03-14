const puppeteer = require("puppeteer-extra");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cookiesStorage = require("./cookies-storage");
puppeteer.use(StealthPlugin());


const options = {
    headless: true,
    args: []
};

let browser = null
let page = null
let cdpClient = null
let interceptCallback = null
let interceptionNeededCallback = null

module.exports = {
    async launch() {
        browser = await puppeteer.launch(options)
    },

    async getPage(_interceptionNeededCallback, _interceptCallback) {
        if (page && page.isClosed()) {
            page.removeAllListeners && page.removeAllListeners()
            page = null
        }

        interceptionNeededCallback = _interceptionNeededCallback
        interceptCallback = _interceptCallback

        if (!page) {
            page = await browser.newPage()
            page.on('framenavigated', async () => {
                let cookies = await page.cookies();
                if (cookies)
                    await cookiesStorage.save(cookies)
            })

            await page.setCookie(...(await cookiesStorage.get()))

            cdpClient = await page.target().createCDPSession();
            await cdpClient.send('Network.setRequestInterception', {
                patterns: [{
                    urlPattern: '*',
                    resourceType: 'Document',
                    interceptionStage: 'HeadersReceived'
                }],
            })
            await cdpClient.on('Network.requestIntercepted', async e => {
                let obj = { interceptionId: e.interceptionId }
                if (interceptionNeededCallback && interceptionNeededCallback(e) === true) {
                    let ret = await cdpClient.send('Network.getResponseBodyForInterception', {
                        interceptionId: e.interceptionId
                    })
                    interceptCallback(ret, e.responseHeaders)
                    obj['errorReason'] = 'BlockedByClient'
                }
                await cdpClient.send('Network.continueInterceptedRequest', obj)
            })
        }

        return page
    },

    setProxy(proxy) {
        options.args.push(`--proxy-server=${proxy}`)
    },

    disableSandbox() {
        options.args.push(
            '--no-sandbox',
            '--disable-setuid-sandbox'
        )
    },

    setHeadful() {
        options.headless = false
    }
}