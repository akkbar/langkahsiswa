FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/website/package.json apps/website/package.json
COPY packages packages
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/website apps/website
RUN npm run build -w @langkahsiswa/website
FROM nginx:alpine
COPY infra/nginx/website.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/website/dist /usr/share/nginx/html
