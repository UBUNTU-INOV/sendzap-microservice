import axios from 'axios'
import crypto from 'crypto'
import logger from '../config/logger.js'
import { db } from './sqlite-auth.service.js'

const WEBHOOK_URL = process.env.WEBHOOK_URL
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'noweb_secret_123'
const MAX_ATTEMPTS = 5
const RECHECK_INTERVAL = 5000 // 5 seconds

/**
 * Calcule la signature HMAC pour sécuriser le webhook
 */
const calculateSignature = (payload) => {
    return crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex')
}

/**
 * Enregistre un webhook dans la file d'attente SQLite
 */
export const triggerWebhook = (event, data) => {
    if (!WEBHOOK_URL) return

    const payload = {
        event,
        timestamp: new Date().toISOString(),
        data
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO webhook_queue (event, payload, next_retry_at, created_at)
            VALUES (?, ?, ?, ?)
        `)
        stmt.run(event, JSON.stringify(payload), Date.now(), Date.now())
        // On ne loggue pas à chaque fois pour éviter de polluer, sauf si besoin
    } catch (error) {
        logger.error(`Webhook Queue Error:`, error)
    }
}

/**
 * Worker qui traite les webhooks en attente
 */
const processQueue = async () => {
    // Récupérer les webhooks prêts à être envoyés
    const now = Date.now()
    const pendingWebhooks = db.prepare(`
        SELECT * FROM webhook_queue 
        WHERE status = 'pending' AND next_retry_at <= ? 
        ORDER BY created_at ASC 
        LIMIT 10
    `).all(now)

    for (const webhook of pendingWebhooks) {
        const payload = JSON.parse(webhook.payload)
        const signature = calculateSignature(payload)

        try {
            await axios.post(WEBHOOK_URL, payload, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'WhatsApp-Noweb-Microservice',
                    'X-Webhook-Signature': signature
                }
            })

            // Succès : supprimer de la file
            db.prepare('DELETE FROM webhook_queue WHERE id = ?').run(webhook.id)
            logger.info(`Webhook: Successfully sent ${webhook.event} (ID: ${webhook.id})`)
            
        } catch (error) {
            const attempts = webhook.attempts + 1
            if (attempts >= MAX_ATTEMPTS) {
                // Trop de tentatives : marquer comme échoué
                db.prepare("UPDATE webhook_queue SET status = 'failed', attempts = ? WHERE id = ?")
                  .run(attempts, webhook.id)
                logger.error(`Webhook: Failed ${webhook.event} after ${MAX_ATTEMPTS} attempts.`)
            } else {
                // Calculer le prochain retry (backoff exponentiel : 1min, 4min, 9min...)
                const delay = Math.pow(attempts, 2) * 60 * 1000 
                db.prepare("UPDATE webhook_queue SET attempts = ?, next_retry_at = ? WHERE id = ?")
                  .run(attempts, now + delay, webhook.id)
                logger.warn(`Webhook: Retry ${attempts}/${MAX_ATTEMPTS} for ${webhook.event} in ${delay/1000}s. Error: ${error.message}`)
            }
        }
    }

    // Relancer le worker
    setTimeout(processQueue, RECHECK_INTERVAL)
}

// Démarrer le worker si une URL est configurée
if (WEBHOOK_URL) {
    logger.info(`Webhook Worker: Started. Monitoring queue for target ${WEBHOOK_URL}`)
    processQueue()
}
