FROM node:26-alpine AS base
RUN apk add --no-cache git
WORKDIR /opt/tuya-cli
RUN git clone https://github.com/tuya/tuya-smart-control-cli.git .
RUN npm install
RUN npm link
WORKDIR /app
CMD ["tuya", "--help"]
