FROM node:18-alpine

WORKDIR /app

# Installeer dependencies
COPY package*.json ./
RUN npm install

# Kopieer de rest van de code
COPY . .

# Start de applicatie
CMD ["node", "index.js"]
