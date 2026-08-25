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

as_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

require_root_access() {
    if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
        echo "Run this script as root or install sudo for your deployment user."
        exit 1
    fi
}

install_host_dependencies() {
    require_root_access

    if [ ! -r /etc/os-release ]; then
        echo "Automatic dependency installation requires Debian or Ubuntu."
        exit 1
    fi

    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
        debian | ubuntu) ;;
        *)
            echo "Automatic dependency installation supports Debian and Ubuntu only."
            exit 1
            ;;
    esac

    echo "Installing host dependencies..."
    as_root apt-get update
    as_root apt-get install -y ca-certificates curl git gnupg openssl

    if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
        echo "Installing Docker Engine and the Docker Compose plugin..."
        as_root install -m 0755 -d /etc/apt/keyrings
        curl -fsSL "https://download.docker.com/linux/$ID/gpg" |
            as_root gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
        as_root chmod a+r /etc/apt/keyrings/docker.gpg

        architecture="$(dpkg --print-architecture)"
        codename="${VERSION_CODENAME:-}"
        if [ -z "$codename" ]; then
            echo "Could not determine the operating-system codename."
            exit 1
        fi
        repository="deb [arch=$architecture signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $codename stable"
        printf '%s\n' "$repository" | as_root tee /etc/apt/sources.list.d/docker.list >/dev/null

        as_root apt-get update
        as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        as_root systemctl enable --now docker
    fi
}

if ! command -v openssl >/dev/null 2>&1 ||
    ! command -v git >/dev/null 2>&1 ||
    ! command -v curl >/dev/null 2>&1 ||
    ! command -v docker >/dev/null 2>&1 ||
    ! docker compose version >/dev/null 2>&1; then
    install_host_dependencies
fi

use_sudo=false
if ! docker info >/dev/null 2>&1; then
    require_root_access
    if as_root docker info >/dev/null 2>&1; then
        use_sudo=true
    else
        echo "Docker is installed but the daemon is unavailable."
        exit 1
    fi
fi

run_docker() {
    if [ "$use_sudo" = true ]; then
        as_root docker "$@"
    else
        docker "$@"
    fi
}

if [ ! -f .env ]; then
    umask 077
    database_password="$(openssl rand -hex 32)"
    backup_key="$(openssl rand -base64 32 | tr -d '\n')"
    bootstrap_secret="$(openssl rand -hex 32)"
    {
        echo "TRACKIT_ORIGIN=$1"
        echo "TRACKIT_PORT=3000"
        echo "TRACKIT_BIND_ADDRESS=0.0.0.0"
        echo "TRACKIT_DB_PASSWORD=$database_password"
        echo "TRACKIT_BOOTSTRAP_SECRET=$bootstrap_secret"
        echo "TRACKIT_TRUST_PROXY=true"
        echo "TRACKIT_BACKUPS_ENABLED=true"
        echo "TRACKIT_BACKUP_KEY=$backup_key"
    } > .env
    echo "Created .env with unique database and backup secrets."
    echo "Use this one-time owner setup secret: $bootstrap_secret"
    echo "Copy BACKUP_KEY somewhere outside this server before relying on backups."
else
    echo "Using the existing .env file."
    if ! grep -q '^TRACKIT_BOOTSTRAP_SECRET=' .env; then
        bootstrap_secret="$(openssl rand -hex 32)"
        printf '\nTRACKIT_BOOTSTRAP_SECRET=%s\n' "$bootstrap_secret" >> .env
        echo "Added the required owner setup secret: $bootstrap_secret"
    fi
fi

echo "Building the candidate image while the current application keeps serving traffic..."
run_docker compose build app
echo "Activating the candidate and waiting for readiness..."
if ! run_docker compose up -d --no-build --wait app; then
    echo "The candidate did not become ready. Inspecting application logs..."
    run_docker compose logs --tail=200 app
    exit 1
fi
run_docker compose ps

echo "TrackIt is starting on port 3000."
echo "Point your HTTPS reverse proxy at this host and open: $1"
echo "Check readiness with: curl -f http://127.0.0.1:3000/api/ready"
