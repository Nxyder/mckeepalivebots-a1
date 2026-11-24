FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install mineflayer@latest node-minecraft-protocol@latest protodef@latest

COPY . .

CMD ["node", "index.js"]
