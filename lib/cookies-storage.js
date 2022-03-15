const fs = require('fs').promises
const {Mutex} = require('async-mutex')
const {getLogger} = require('./logging')

const logger = getLogger('CookiesStorage')

let storageFileName = null
const mutex = new Mutex()

async function exists(path) {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

function cookiesAsHashed(cookies) {
    if (!cookies.length)
        return {}

    const map = {}
    const sep = '|;|;'
    for (const c of cookies) {
        const k = `${c.domain}${sep}${c.path}${sep}${c.name}`
        map[k] = c
    }
    return map
}

module.exports = {
    async save(newCookies) {
        let currentCookies = await this.get()

        await mutex.runExclusive(async () => {
            if (currentCookies.length) {
                for (let newCookie of newCookies) {
                    if (!currentCookies.length)
                        break
                    let i = currentCookies.findIndex((oldCookie) => {
                        return oldCookie.domain === newCookie.domain
                            && oldCookie.path === newCookie.path
                            && oldCookie.name === newCookie.name
                            && (
                                oldCookie.value !== newCookie.value
                                || oldCookie.expires !== newCookie.expires
                            )
                    })
                    if (i !== -1) {
                        let removed = currentCookies.splice(i, 1)
                        // logger.debug('removed cookie:', removed, 'instead got new one:', newCookie)
                    }
                }
            }

            const cookiesMap = Object.assign({}, cookiesAsHashed(currentCookies), cookiesAsHashed(newCookies))
            await fs.writeFile(storageFileName, JSON.stringify(Object.values(cookiesMap), null, 2), 'utf-8')
        })
    },

    async get() {
        if (!(await exists(storageFileName)))
            return []

        try {
            const raw = await mutex.runExclusive(async () => {
                return await fs.readFile(storageFileName, 'utf-8')
            })
            return JSON.parse(raw)
        } catch (e) {
            logger.error('Failed to parse storage:', e)
            return []
        }
    },

    setFileName(name) {
        storageFileName = name
    }
};