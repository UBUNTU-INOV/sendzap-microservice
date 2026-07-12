import crypto from 'crypto'
import logger from '../config/logger.js'

export const authMiddleware = (req, res, next) => {
    if (req.path === '/api-docs' || req.path.startsWith('/api-docs/') || req.path === '/health' || req.path === '/test-ui') {
        return next()
    }

    const apiKey = req.headers['x-api-key'] || req.query.api_key
    const validApiKey = process.env.API_KEY

    if (!validApiKey) {
        logger.error('FATAL: API_KEY environment variable is not set. Refusing all requests.')
        return res.status(500).json({ error: 'Server misconfiguration: API_KEY not set' })
    }

    if (!apiKey || apiKey.length !== validApiKey.length ||
        !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validApiKey))) {
        logger.warn(`Auth: Unauthorized access attempt from ${req.ip} (using ${apiKey ? 'invalid key' : 'no key'})`)
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API KEY' })
    }

    next()
}
