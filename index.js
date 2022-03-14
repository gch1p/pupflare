const cookiesStorage = require('./cookies-storage')
const browser = require('./browser')
const {singlePageWrapper, PageWrapper} = browser
const os = require('os')
const path = require('path')

const argv = require('minimist')(process.argv.slice(2), {
    string: ['retries', 'timeout', 'cookies', 'port', 'proxy'],
    boolean: ['no-sandbox', 'headful', 'reuse'],
    stopEarly: true,
    default: {
        port: 3000,
        retries: 10,
        timeout: 30000,
        cookies: path.join(os.homedir(), '.rt-pupflare-cookies.json'),
        reuse: false,
    }
})

let reusePage = argv.reuse
const maxTryCount = parseInt(argv.retries)
const loadingTimeout = parseInt(argv.timeout)

const Koa = require('koa');
const Router = require('@koa/router');
const app = new Koa();
const router = new Router();


async function requestHandler(ctx, next) {
    if (!ctx.query.url)
        throw new Error('url not specified')

    const myResult = {
        binary: false,
        headers: [],
        data: ''
    }

    let responseSet = false
    let pageWrapper = null

    await new Promise(async (resolve, reject) => {
        const fInterceptionNeeded = (e) => e.isDownload === true
        const fInterception = (response, headers) => {
            Object.assign(myResult, {
                data: response.base64Encoded ? response.body : btoa(response.body),
                binary: true,
                headers
            })
            resolve()
        }

        pageWrapper = reusePage ? singlePageWrapper : new PageWrapper()
        const page = await pageWrapper.getPage(fInterceptionNeeded, fInterception)

        // not tested
        if (ctx.method === "POST") {
            await page.removeAllListeners('request')
            await page.setRequestInterception(true)
            page.on('request', interceptedRequest => {
                interceptedRequest.continue({
                    'method': 'POST',
                    'postData': ctx.request.rawBody
                })
            })
        }

        try {
            let tryCount = 0
            let response = await page.goto(ctx.query.url, {
                timeout: loadingTimeout,
                waitUntil: 'domcontentloaded'
            })

            let body = await response.text()
            while ((body.includes("cf-browser-verification") || body.includes('cf-captcha-container')) && tryCount <= maxTryCount) {
                let newResponse = await page.waitForNavigation({
                    timeout: loadingTimeout,
                    waitUntil: 'domcontentloaded'
                });
                if (newResponse)
                    response = newResponse;
                body = await response.text();
                tryCount++;
            }

            myResult.data = await response.text()
            myResult.headers = await response.headers()

            resolve()
        } catch (error) {
            if (!error.toString().includes("ERR_BLOCKED_BY_CLIENT")) {
                ctx.status = 500
                ctx.body = error

                responseSet = true
                resolve()
            }
        }
    })

    if (!responseSet)
        ctx.body = JSON.stringify(myResult)

    if (!reusePage)
        pageWrapper.page.close()

    await next()
}

router
    .get('/request', requestHandler)
    .post('/request', requestHandler)
    .get('/cookies', async (ctx, next) => {
        ctx.body = JSON.stringify(await cookiesStorage.get())
        await next()
    });


(async () => {
    cookiesStorage.setFileName(argv.cookies)

    await browser.launch({
        proxy: argv.proxy ?? null,
        noSandbox: argv['no-sandbox'] ?? false,
        headful: argv.headful ?? false,
    })

    app.use(router.routes())
        .use(router.allowedMethods())

    app.on('error', (error) => {
        console.error('[app.onerror]', error)
    })

    app.listen(parseInt(argv.port), '127.0.0.1')
})();
