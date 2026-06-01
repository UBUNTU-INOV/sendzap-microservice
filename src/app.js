import 'dotenv/config'
import express from 'express'
import routes from './routes/index.js'
import logger from './config/logger.js'
import { authMiddleware } from './middleware/auth.middleware.js'
import { globalLimiter } from './middleware/rate-limit.middleware.js'

import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(globalLimiter)

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`)
    next()
})

app.use(authMiddleware)

app.use('/', routes)

const swaggerDocument = YAML.load('./swagger.yaml')
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use((err, req, res, next) => {
    logger.error(err.stack)
    res.status(500).json({ error: 'Internal Server Error' })
})

export default app
