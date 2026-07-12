# Flutter web build for mobile.oewang.com (Railway)
FROM ghcr.io/cirruslabs/flutter:3.44.4 AS build

WORKDIR /app
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .

# Railway service variables are injected as build args (declare to use).
ARG API_URL
ARG APP_URL
ARG ENCRYPTION_KEY
ARG SESSION_COOKIE_NAME=oewang-session

# .env is bundled as a Flutter asset (see pubspec.yaml)
RUN printf 'API_URL=%s\nAPP_URL=%s\nENCRYPTION_KEY=%s\nSESSION_COOKIE_NAME=%s\n' \
    "$API_URL" "$APP_URL" "$ENCRYPTION_KEY" "$SESSION_COOKIE_NAME" > .env \
  && flutter build web --release

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
# nginx entrypoint runs envsubst on templates — picks up Railway's $PORT
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=8080
