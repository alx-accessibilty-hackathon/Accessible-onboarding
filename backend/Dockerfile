# The API. Build from the repository root (it needs shared/ and api/):
#   docker build -f backend/Dockerfile .
FROM golang:1.24-alpine AS build
WORKDIR /src
ENV GOTOOLCHAIN=local
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /out/bridge .

FROM alpine:3.20
# ffmpeg turns recorded voice clips into WAV for speech-to-text
RUN apk add --no-cache ffmpeg ca-certificates
WORKDIR /app
COPY --from=build /out/bridge /app/bridge
COPY shared /app/shared
COPY api /app/api
ENV FLOWS_DIR=/app/shared/flows \
    NEEDS_FILE=/app/shared/vocab/needs.json \
    PORT=8080
EXPOSE 8080
CMD ["/app/bridge", "serve"]
