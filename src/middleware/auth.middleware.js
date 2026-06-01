import crypto from 'crypto'
import logger from '../config/logger.js'

export const authMiddleware = (req, res, next) => {
    if (req.path === '/api-docs' || req.path.startsWith('/api-docs/') || req.path === '/health') {
        return next()
    }

    const apiKey = req.headers['x-api-key'] || req.query.api_key
    const validApiKey = process.env.API_KEY

    if (!validApiKey) {
        logger.warn('Auth: API_KEY not set in environment. Allowing request (INSECURE).')
        return next()
    }

    if (!apiKey || apiKey.length !== validApiKey.length ||
        !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validApiKey))) {
        logger.warn(`Auth: Unauthorized access attempt from ${req.ip} (using ${apiKey ? 'invalid key' : 'no key'})`)
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API KEY' })
    }

    next()
}
