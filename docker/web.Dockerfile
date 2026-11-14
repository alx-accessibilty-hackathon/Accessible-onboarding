# The web pages (widget demo pages, staff app) and the widget file, served by nginx,
# which also forwards /api to the API container: one site, no CORS needed.
# Build from the repository root: docker build -f docker/web.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY shared ./shared
COPY api ./api
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build && npm run build:widget \
 && mkdir -p dist/v1 && cp dist-widget/bridge-onboarding.js dist/v1/

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
