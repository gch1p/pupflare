const log4js = require('log4js')

module.exports = {
    configure(verbose) {
        const categories = {
            default: {
                appenders: ['stdout-filter'],
                level: 'trace'
            }
        }
        const appenders = {
            stdout: {
                type: 'stdout',
                level: 'warn'
            },
            'stdout-filter': {
                type: 'logLevelFilter',
                appender: 'stdout',
                level: verbose ? 'debug' : 'warn'
            }
        }
        log4js.configure({
            appenders,
            categories
        })
    },

    getLogger(...args) {
        return log4js.getLogger(...args)
    },

    shutdown(cb) {
        log4js.shutdown(cb)
    }
}
