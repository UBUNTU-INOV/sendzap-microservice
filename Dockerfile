FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

# 512MB est un bon équilibre pour 3-5 sessions actives
CMD ["node", "--max-old-space-size=512", "index.js"]
