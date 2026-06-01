import rateLimit from 'express-rate-limit'

// With 100 sessions, the Laravel backend is the only client (single IP).
// Limits are set high enough to not block legitimate multi-session traffic.
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
})

export const messageLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 500,   // 100 sessions × 5 messages/sec burst
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Message rate limit exceeded. Please wait a moment.' }
})

export const checkNumberLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 600,   // 100 sessions × 6 checks/min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Number check rate limit exceeded. Please wait a moment.' }
})
