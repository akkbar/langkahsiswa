FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/website/package.json apps/website/package.json
COPY packages packages
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/admin apps/admin
RUN npm run build -w @langkahsiswa/admin
FROM nginx:alpine
COPY infra/nginx/admin.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
