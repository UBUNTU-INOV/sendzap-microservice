FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

# 3.5GB heap — 120 sessions x ~30MB + runtime overhead, within 4GB container limit
CMD ["node", "--max-old-space-size=3584", "index.js"]
