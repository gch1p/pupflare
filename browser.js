const puppeteer = require("puppeteer-extra");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cookiesStorage = require("./cookies-storage");
puppeteer.use(StealthPlugin());


const chromeOptions = {
    headless: true,
    args: []
};

let browser = null
let cdpClient = null

class PageWrapper {
    constructor() {
        this.intrNeededCallback = null
        this.intrCallback = null

        this.page = null
    }

    async getPage(interceptionNeededCallback, interceptCallback) {
        this.intrCallback = interceptCallback
        this.intrNeededCallback = interceptionNeededCallback

        if (this.page !== null && this.page.isClosed()) {
            this.page.removeAllListeners && this.page.removeAllListeners()
            this.page = null
        }

        if (this.page !== null)
            return this.page

        this.page = await browser.newPage()
        this.page.on('domcontentloaded', async () => {
            try {
                let cookies = await this.page.cookies();
                if (cookies)
                    await cookiesStorage.save(cookies)
            } catch (e) {
                console.warn(e)
            }
        })

        await this.page.setCookie(...(await cookiesStorage.get()))

        cdpClient = await this.page.target().createCDPSession();
        await cdpClient.send('Network.setRequestInterception', {
            patterns: [{
                urlPattern: '*',
                resourceType: 'Document',
                interceptionStage: 'HeadersReceived'
            }],
        })
        await cdpClient.on('Network.requestIntercepted', async e => {
            let obj = { interceptionId: e.interceptionId }
            if (this.intrNeededCallback && this.intrNeededCallback(e) === true) {
                let ret = await cdpClient.send('Network.getResponseBodyForInterception', {
                    interceptionId: e.interceptionId
                })
                this.intrCallback(ret, e.responseHeaders)
                obj['errorReason'] = 'BlockedByClient'
            }
            await cdpClient.send('Network.continueInterceptedRequest', obj)
        })

        return this.page
    }
}

let singlePageWrapper = new PageWrapper()

module.exports = {
    async launch(options) {
        if (options.proxy)
            chromeOptions.args.push(`--proxy-server=${options.proxy}`)

        if (options.noSandbox)
            chromeOptions.args.push(
                '--no-sandbox',
                '--disable-setuid-sandbox'
            )

        if (options.headful)
            chromeOptions.headless = false

        browser = await puppeteer.launch(chromeOptions)
    },

    singlePageWrapper,
    PageWrapper,
}