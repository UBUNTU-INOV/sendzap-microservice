import app from './src/app.js'
import { initSessions, getAllSessions, closeSession } from './src/services/session.manager.js'
import logger from './src/config/logger.js'

const PORT = process.env.PORT || 3000

async function shutdown(server, signal) {
    logger.info(`${signal} received. Closing sockets (credentials kept in SQLite)...`)

    server.close(async () => {
        const sessions = getAllSessions()
        await Promise.all(sessions.map(s => closeSession(s.id).catch(() => {})))
        logger.info('All sockets closed. Exiting.')
        process.exit(0)
    })

    setTimeout(() => {
        logger.error('Forced exit after 15s timeout.')
        process.exit(1)
    }, 15000)
}

async function bootstrap() {
    try {
        await initSessions()

        const server = app.listen(PORT, () => {
            logger.info(`SendZap server running on port ${PORT}`)
        })

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${PORT} is already in use.`)
            } else {
                logger.error('Server error:', error)
            }
            process.exit(1)
        })

        process.on('SIGTERM', () => shutdown(server, 'SIGTERM'))
        process.on('SIGINT', () => shutdown(server, 'SIGINT'))
    } catch (error) {
        logger.error('Failed to start server:', error)
        process.exit(1)
    }
}

bootstrap()
