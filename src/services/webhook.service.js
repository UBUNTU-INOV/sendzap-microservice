import axios from 'axios'
import crypto from 'crypto'
import logger from '../config/logger.js'
import { db } from './sqlite-auth.service.js'

const WEBHOOK_URL = process.env.WEBHOOK_URL
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

if (WEBHOOK_URL && !WEBHOOK_SECRET) {
    logger.warn('Webhook: WEBHOOK_SECRET is not set. Webhook signatures will be empty. Set WEBHOOK_SECRET in your .env.')
}

const MAX_ATTEMPTS = 5
const RECHECK_INTERVAL = 3000  // faster processing under high message volume
const BATCH_SIZE = 20           // process more webhooks per tick with 100 sessions
const FAILED_TTL_MS = 7 * 24 * 60 * 60 * 1000

const stmts = {
    insert: db.prepare(`INSERT INTO webhook_queue (event, payload, next_retry_at, created_at) VALUES (?, ?, ?, ?)`),
    pending: db.prepare(`SELECT * FROM webhook_queue WHERE status = 'pending' AND next_retry_at <= ? ORDER BY created_at ASC LIMIT ?`),
    delete: db.prepare(`DELETE FROM webhook_queue WHERE id = ?`),
    markFailed: db.prepare(`UPDATE webhook_queue SET status = 'failed', attempts = ? WHERE id = ?`),
    retry: db.prepare(`UPDATE webhook_queue SET attempts = ?, next_retry_at = ? WHERE id = ?`),
    cleanFailed: db.prepare(`DELETE FROM webhook_queue WHERE status = 'failed' AND created_at < ?`),
}

const calculateSignature = (payload) => {
    if (!WEBHOOK_SECRET) return ''
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex')
}

export const triggerWebhook = (event, data) => {
    if (!WEBHOOK_URL) return

    const payload = { event, timestamp: new Date().toISOString(), data }
    try {
        stmts.insert.run(event, JSON.stringify(payload), Date.now(), Date.now())
    } catch (error) {
        logger.error('Webhook Queue Error:', error)
    }
}

const processQueue = async () => {
    const now = Date.now()
    const pendingWebhooks = stmts.pending.all(now, BATCH_SIZE)

    for (const webhook of pendingWebhooks) {
        const payload = JSON.parse(webhook.payload)
        const signature = calculateSignature(payload)

        try {
            await axios.post(WEBHOOK_URL, payload, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SendZap-Microservice',
                    'X-Webhook-Signature': signature
                }
            })
            stmts.delete.run(webhook.id)
            logger.info(`Webhook: Sent ${webhook.event} (ID: ${webhook.id})`)
        } catch (error) {
            const attempts = webhook.attempts + 1
            if (attempts >= MAX_ATTEMPTS) {
                stmts.markFailed.run(attempts, webhook.id)
                logger.error(`Webhook: Failed ${webhook.event} after ${MAX_ATTEMPTS} attempts.`)
            } else {
                const delay = Math.pow(attempts, 2) * 60 * 1000
                stmts.retry.run(attempts, now + delay, webhook.id)
                logger.warn(`Webhook: Retry ${attempts}/${MAX_ATTEMPTS} for ${webhook.event} in ${delay / 1000}s. Error: ${error.message}`)
            }
        }
    }

    // Nettoyage périodique des entrées échouées trop anciennes
    stmts.cleanFailed.run(now - FAILED_TTL_MS)

    setTimeout(processQueue, RECHECK_INTERVAL)
}

if (WEBHOOK_URL) {
    logger.info(`Webhook Worker: Started. Target: ${WEBHOOK_URL}`)
    processQueue()
}
