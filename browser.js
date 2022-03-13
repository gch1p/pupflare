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


module.exports = {
    async launch() {
        browser = await puppeteer.launch(options)
    },

    async getPage() {
        if (page && page.isClosed()) {
            page.removeAllListeners && page.removeAllListeners()
            page = null
        }

        if (!page) {
            page = await browser.newPage()
            page.on('framenavigated', async () => {
                let cookies = await page.cookies();
                if (cookies)
                    await cookiesStorage.save(cookies)
            })

            page.setCookie(...(await cookiesStorage.get()))
        }

        return page
    },
    get() {
        return browser
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
        options.headless = false;
    }
}