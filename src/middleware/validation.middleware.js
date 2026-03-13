import Joi from 'joi'

// Helper to validate request
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property], { abortEarly: false })
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ')
            return res.status(400).json({ error: errorMessage })
        }
        next()
    }
}

// Common schemas
const sessionIdSchema = Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(50).required()
const phoneSchema = Joi.string().min(5).max(20).required()

// Endpoint schemas
export const validateSessionId = validate(Joi.object({
    id: sessionIdSchema
}), 'params')

export const validateSendMessage = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    message: Joi.string().max(4096).optional(),
    mediaUrl: Joi.string().uri().optional(),
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    fileName: Joi.string().max(255).optional(),
    caption: Joi.string().max(1024).optional()
}))

export const validateSendBulk = validate(Joi.object({
    sessionId: sessionIdSchema,
    receivers: Joi.array().items(phoneSchema).min(1).required(),
    message: Joi.string().max(4096).required(),
    mediaUrl: Joi.string().uri().optional(),
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    fileName: Joi.string().max(255).optional(),
    caption: Joi.string().max(1024).optional(),
    delayMs: Joi.number().integer().min(100).max(10000).default(1000)
}))

export const validateCheckNumber = validate(Joi.object({
    sessionId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(50).optional(),
    number: phoneSchema
}))

export const validateSendContact = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    contactName: Joi.string().max(100).required(),
    contactNumber: phoneSchema,
    organization: Joi.string().max(100).optional()
}))

export const validateSetTyping = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    presence: Joi.string().valid('composing', 'recording', 'paused').default('composing')
}))

export const validateListGroupsOrContacts = validate(Joi.object({
    sessionId: sessionIdSchema
}), 'params')

export const validateGroupParticipants = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required(),
    participants: Joi.array().items(Joi.string()).min(1).required(),
    action: Joi.string().valid('add', 'remove', 'promote', 'demote').optional()
}))

export const validateGroupInvite = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required()
}))

export const validateGroupJoin = validate(Joi.object({
    sessionId: sessionIdSchema,
    code: Joi.string().required()
}))

export const validateGroupSettings = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required(),
    setting: Joi.string().valid('announcement', 'not-announcement', 'locked', 'unlocked').required()
}))

export const validateGroupIdentity = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required(),
    type: Joi.string().valid('subject', 'description', 'picture').required(),
    value: Joi.string().required() // Can be subject text, description text, or image URL for picture
}))

export const validateSendStatus = validate(Joi.object({
    sessionId: sessionIdSchema,
    mediaUrl: Joi.string().uri().optional(),
    mediaType: Joi.string().valid('image', 'text').default('text'),
    message: Joi.string().max(4096).optional(), // message for text status
    caption: Joi.string().max(1024).optional() // caption for image status
}))

export const validateGroupCreate = validate(Joi.object({
    sessionId: sessionIdSchema,
    subject: Joi.string().min(1).max(100).required(),
    participants: Joi.array().items(phoneSchema).optional().default([])
}))

export const validateGroupMetadata = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required()
}), 'params')
