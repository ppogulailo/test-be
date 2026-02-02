FROM node:22.14.0-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3333
CMD ["npm", "run", "start:dev"]
