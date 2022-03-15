const puppeteer = require("puppeteer-extra");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cookiesStorage = require("./cookies-storage");
puppeteer.use(StealthPlugin())

const {getLogger} = require('./logging')

const logger = getLogger('browser')


const chromeOptions = {
    headless: true,
    args: []
};

let browser = null

class PageWrapper {
    constructor() {
        this.intrNeededCallback = null
        this.intrCallback = null
        this.intrPostCallback = null

        this.page = null
        this.cdpClient = null
    }

    async getPage(interceptionNeededCallback, interceptCallback, postInterceptCallback) {
        this.intrCallback = interceptCallback
        this.intrNeededCallback = interceptionNeededCallback
        this.intrPostCallback = postInterceptCallback

        if (this.page !== null && this.page.isClosed()) {
            this.page.removeAllListeners && this.page.removeAllListeners()
            this.page = null
        }

        if (this.page !== null)
            return this.page

        this.page = await browser.newPage()

        let cookies = await cookiesStorage.get()
        // logger.debug('loaded cookies:', cookies)
        await this.page.setCookie(...cookies)

        this.page.on('domcontentloaded', async () => {
            try {
                let cookies = await this.page.cookies();
                if (cookies)
                    await cookiesStorage.save(cookies)
            } catch (e) {
                logger.error('page.cookies() failed:', e)
            }
        })

        await this.page.removeAllListeners('request')
        await this.page.setRequestInterception(true)
        this.page.on('request', async request => {
            let contData = this.intrPostCallback(request)
            await request.continue(contData)
        })

        this.cdpClient = await this.page.target().createCDPSession();
        await this.cdpClient.send('Network.enable')
        await this.cdpClient.send('Network.setRequestInterception', {
            patterns: [
                {
                    urlPattern: '*',
                    resourceType: 'Document',
                    interceptionStage: 'HeadersReceived'
                }
            ],
        })
        await this.cdpClient.on('Network.requestIntercepted', async e => {
            let obj = {interceptionId: e.interceptionId}
            if (this.intrNeededCallback && this.intrNeededCallback(e) === true) {
                let ret = await this.cdpClient.send('Network.getResponseBodyForInterception', {
                    interceptionId: e.interceptionId
                })
                this.intrCallback(ret, e.responseHeaders)
                obj['errorReason'] = 'BlockedByClient'
            }
            await this.cdpClient.send('Network.continueInterceptedRequest', obj)
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