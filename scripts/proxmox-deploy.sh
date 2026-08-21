#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: sh scripts/proxmox-deploy.sh https://trackit.example.com"
    exit 1
fi

case "$1" in
    https://*) ;;
    *)
        echo "TrackIt requires an https:// public origin."
        exit 1
        ;;
esac

command -v docker >/dev/null 2>&1 || {
    echo "Docker Engine with the Compose plugin is required."
    exit 1
}
command -v openssl >/dev/null 2>&1 || {
    echo "openssl is required to generate installation secrets."
    exit 1
}
docker compose version >/dev/null 2>&1 || {
    echo "The Docker Compose plugin is required."
    exit 1
}

if [ ! -f .env ]; then
    umask 077
    database_password="$(openssl rand -hex 32)"
    backup_key="$(openssl rand -base64 32 | tr -d '\n')"
    {
        echo "TRACKIT_ORIGIN=$1"
        echo "TRACKIT_PORT=3000"
        echo "TRACKIT_BIND_ADDRESS=0.0.0.0"
        echo "TRACKIT_DB_PASSWORD=$database_password"
        echo "TRACKIT_TRUST_PROXY=true"
        echo "TRACKIT_BACKUPS_ENABLED=true"
        echo "TRACKIT_BACKUP_KEY=$backup_key"
    } > .env
    echo "Created .env with unique database and backup secrets."
    echo "Copy BACKUP_KEY somewhere outside this server before relying on backups."
else
    echo "Using the existing .env file; no secrets were changed."
fi

docker compose up -d --build
docker compose ps

echo "TrackIt is starting on port 3000."
echo "Point your HTTPS reverse proxy at this host and open: $1"
echo "Check health with: curl -f http://127.0.0.1:3000/api/health"
