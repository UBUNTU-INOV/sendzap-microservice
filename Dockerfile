FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p sessions

EXPOSE 3000

# 3.5GB heap — 100 sessions x ~30MB + runtime overhead, fits in 6GB server
CMD ["node", "--max-old-space-size=3584", "index.js"]
