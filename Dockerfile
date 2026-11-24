FROM node:20-alpine

WORKDIR /app

# Eerst alleen package.json
COPY package.json ./

# Installeer exact wat in package.json staat
RUN npm install --omit=dev

# Nu pas de rest van de code
COPY . .

CMD ["node", "supervisor.js"]
