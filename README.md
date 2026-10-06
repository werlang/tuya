# Tuya CLI (Dockerized)

Terminal control for Tuya WiFi board (pablo-gaming power). No local node required.

## Setup

```bash
cp .env.example .env
# put sk-XX... from https://tuya.ai/ (Get Started -> API Key)
docker compose up --build -d
docker compose exec tuya tuya init
docker compose exec tuya tuya doctor
```

## Use

```bash
# list / on / off
docker compose exec tuya tuya device control <device_id> '{"switch_1": true}'
docker compose exec tuya tuya device control <device_id> '{"switch_1": false}'

# one-shot without started service
docker compose run --rm tuya tuya --help
```

## Panel (port 8080)

Simple on/off dashboard for PC Gamer.

```bash
docker compose up -d panel
open http://localhost:8080
```

- `GET /` — buttons + live status (5s poll)
- `GET /api/status` — `{online, switch_1}`
- `POST /api/control {"switch_1": true|false}`

Config persists in `./config` (`/root/.tuya-cli`).
