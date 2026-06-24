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
const sessionIdSchema = Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(3).max(50).required()
    .custom((value, helpers) => {
        // Block null bytes and control characters (path traversal guard)
        if (/[\x00-\x1f\x7f]/.test(value)) return helpers.error('string.base')
        // Block prototype pollution keywords
        if (['__proto__', 'constructor', 'prototype'].includes(value)) return helpers.error('string.base')
        return value
    })

const phoneSchema = Joi.string().min(5).max(30).required()

// mediaUrl restricted to http/https only (blocks file://, javascript:, gopher://)
const mediaUrlSchema = Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .optional()

// Endpoint schemas
export const validateSessionId = validate(Joi.object({
    id: sessionIdSchema
}), 'params')

export const validateSendMessage = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    message: Joi.string().max(4096).optional(),
    mediaUrl: mediaUrlSchema,
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    fileName: Joi.string().max(255).pattern(/^[^/\\<>:"|?*\x00-\x1f]+$/).optional(),
    caption: Joi.string().max(1024).optional()
}))

export const validateSendBulk = validate(Joi.object({
    sessionId: sessionIdSchema,
    receivers: Joi.array().items(phoneSchema).min(1).max(500).required(),
    message: Joi.string().allow('').max(4096).optional(),
    mediaUrl: mediaUrlSchema,
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    fileName: Joi.string().max(255).pattern(/^[^/\\<>:"|?*\x00-\x1f]+$/).optional(),
    caption: Joi.string().max(1024).optional(),
    delayMs: Joi.number().integer().min(100).max(10000).default(1000)
        .custom((v, h) => Number.isFinite(v) ? v : h.error('number.base'))
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

export const validateSendCarousel = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    text: Joi.string().max(1024).optional(),
    footer: Joi.string().max(256).optional(),
    cards: Joi.array().items(Joi.object({
        imageUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).required(),
        caption: Joi.string().max(1024).optional(),
        footer: Joi.string().max(256).optional(),
        buttons: Joi.array().items(Joi.object({
            type: Joi.string().valid('url', 'reply', 'call', 'copy').required(),
            displayText: Joi.string().max(50).required(),
            url: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
            phoneNumber: Joi.string().min(5).max(30).optional(),
            copy: Joi.string().max(100).optional(),
            id: Joi.string().max(50).optional()
        })).min(1).max(2).optional()
    })).min(2).max(10).required()
}))

export const validateSendTemplateButtons = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    text: Joi.string().max(1024).required(),
    footer: Joi.string().max(256).optional(),
    optionText: Joi.string().max(50).optional(),
    optionTitle: Joi.string().max(50).optional(),
    buttons: Joi.array().items(Joi.alternatives().try(
        Joi.object({
            type: Joi.string().valid('url').required(),
            displayText: Joi.string().max(50).required(),
            url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).required()
        }),
        Joi.object({
            type: Joi.string().valid('reply').required(),
            displayText: Joi.string().max(50).required(),
            id: Joi.string().max(50).required()
        }),
        Joi.object({
            type: Joi.string().valid('call').required(),
            displayText: Joi.string().max(50).required(),
            phoneNumber: Joi.string().min(5).max(30).required()
        }),
        Joi.object({
            type: Joi.string().valid('copy').required(),
            displayText: Joi.string().max(50).required(),
            copy: Joi.string().max(100).required()
        }),
        Joi.object({
            type: Joi.string().valid('list').required(),
            displayText: Joi.string().max(50).required(),
            sections: Joi.array().items(Joi.object({
                title: Joi.string().max(100).required(),
                rows: Joi.array().items(Joi.object({
                    id: Joi.string().max(50).required(),
                    title: Joi.string().max(100).required(),
                    description: Joi.string().max(200).optional()
                })).min(1).required()
            })).min(1).required()
        })
    )).min(1).max(3).required()
}))

export const validateSendButtons = validate(Joi.object({
    sessionId: sessionIdSchema,
    to: phoneSchema,
    text: Joi.string().max(1024).required(),
    footer: Joi.string().max(256).optional(),
    buttons: Joi.array().items(Joi.object({
        buttonId: Joi.string().max(50).required(),
        buttonText: Joi.object({
            displayText: Joi.string().max(50).required()
        }).required()
    })).min(1).max(3).required()
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

// Variant pour les routes GET qui passent sessionId/groupId en params
export const validateGroupInviteParams = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required()
}), 'params')

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
    mediaUrl: mediaUrlSchema,
    mediaType: Joi.string().valid('image', 'video', 'audio', 'text').default('text'),
    message: Joi.string().max(4096).optional(),
    caption: Joi.string().max(1024).optional(),
    backgroundColor: Joi.string().max(20).optional(),
    font: Joi.number().integer().min(0).max(5).optional(),
    statusJidList: Joi.array().items(Joi.string()).optional()
}))

export const validateDeleteStatus = validate(Joi.object({
    sessionId: sessionIdSchema,
    messageId: Joi.string().required()
}))

export const validateGroupCreate = validate(Joi.object({
    sessionId: sessionIdSchema,
    subject: Joi.string().min(1).max(100).required(),
    participants: Joi.array().items(Joi.string().min(5).max(30)).optional().default([])
}))

export const validateGroupMetadata = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required()
}), 'params')

export const validateGroupLeave = validate(Joi.object({
    sessionId: sessionIdSchema,
    groupId: Joi.string().required()
}))

// ─── Channel/Newsletter Validations ──────────────────────────────────────

export const validateChannelList = validate(Joi.object({
    sessionId: sessionIdSchema
}), 'params')

export const validateChannelCreate = validate(Joi.object({
    sessionId: sessionIdSchema,
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(2048).optional()
}))

export const validateChannelSend = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required(),
    message: Joi.string().max(4096).optional(),
    mediaUrl: mediaUrlSchema,
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').optional(),
    caption: Joi.string().max(1024).optional()
}))

export const validateChannelInfo = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required()
}), 'params')

export const validateChannelFollow = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required()
}))

export const validateChannelMute = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required(),
    mute: Joi.boolean().default(true)
}))

export const validateChannelUpdate = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required(),
    type: Joi.string().valid('name', 'description', 'picture').required(),
    value: Joi.string().required()
}))

export const validateChannelDelete = validate(Joi.object({
    sessionId: sessionIdSchema,
    channelId: Joi.string().required()
}))
