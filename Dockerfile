FROM node:20-alpine

WORKDIR /app

# Eerst alleen package.json (lockfile bewust niet, zodat we vers schrijven)
COPY package.json ./

# Installeer exact wat in package.json staat (geen @latest!)
RUN npm install --omit=dev

# Nu pas de rest van de code
COPY . .

CMD ["node", "supervisor.js"]
