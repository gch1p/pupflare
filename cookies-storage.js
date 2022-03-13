const fs = require('fs').promises

let storageFileName = null

async function exists(path) {
    try {
        await fs.access(path)
        return true
    } catch {
        return false
    }
}

module.exports = {
    async save(newCookies) {
        let currentCookies = await this.get()
        if (currentCookies.length) {
            for (let newCookie of newCookies) {
                if (!currentCookies.length)
                    break
                let i = currentCookies.findIndex((c) => {
                    return c.domain === newCookie.domain
                        && c.path === newCookie.path
                        && c.name === newCookie.name
                })
                if (i !== -1)
                    currentCookies.splice(i, 1)
            }
        }
        currentCookies.push(...newCookies)
        // console.log('[cookies.save] saving cookies:', currentCookies)
        await fs.writeFile(storageFileName, JSON.stringify(currentCookies, null, 2), 'utf-8')
    },

    async get() {
        if (!(await exists(storageFileName)))
            return []

        try {
            return JSON.parse(await fs.readFile(storageFileName, 'utf-8'))
        } catch (e) {
            console.error(e)
            return []
        }
    },

    setFileName(name) {
        storageFileName = name
    }
};