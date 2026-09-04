FROM node:22-alpine AS build
WORKDIR /fleet-service
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsoa.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /fleet-service
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /fleet-service/dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
