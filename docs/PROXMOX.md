# Deploy TrackIt on Proxmox

The simplest supported layout is a small Debian 13 or Ubuntu 24.04 VM running Docker Engine. A VM
keeps Docker's kernel, networking, and storage behavior predictable. An unprivileged LXC also works
when nesting and keyctl are enabled, but Docker-in-LXC troubleshooting is specific to the Proxmox
host and is not a TrackIt concern.

## Recommended VM

- 2 vCPU, 2–4 GB RAM, and 20 GB or more disk.
- A static DHCP lease or static address on the private network.
- An infrastructure-level snapshot or recovery policy appropriate for the deployment.
- DNS for the chosen TrackIt hostname pointing to a reverse proxy.

Clone or copy the TrackIt release bundle into `/opt/trackit`. Do not run the application from a
temporary directory. The deployment script installs its host dependencies and configures Docker's
official package repository when Docker Engine or the Compose plugin is missing.

## First deployment

From `/opt/trackit`, run:

```bash
sh scripts/proxmox-deploy.sh https://trackit.example.com
```

On Debian and Ubuntu, the command installs CA certificates, curl, Git, GnuPG, OpenSSL, Docker
Engine, Buildx, and the Docker Compose plugin when needed. It may prompt for the deployment user's
sudo password. It then creates a private `.env` with random database and bootstrap secrets, builds the
application, starts PostgreSQL and TrackIt, and prints container status. It never overwrites an
existing `.env`.

On first installation, enter the printed owner setup secret in TrackIt's setup screen. This stops
another network visitor from claiming the instance before the owner account exists. The secret is
also stored in the private `.env`; after an owner exists, setup cannot create another one.

The automatic installer intentionally stops on other Linux distributions instead of changing
unknown package sources. Install Docker Engine, the Compose plugin, OpenSSL, curl, and Git manually
there, then run the same command again.

## HTTPS reverse proxy

TrackIt requires HTTPS for secure authentication cookies and passkeys. In Nginx Proxy Manager,
Caddy, Traefik, or another proxy:

1. Create a host for `trackit.example.com`.
2. Forward it to the VM address on port `3000` using HTTP on the trusted LAN.
3. Request or install a valid TLS certificate and force HTTPS.
4. Preserve `Host`, `X-Forwarded-Proto`, and the client address.
5. Do not expose PostgreSQL or publish port 5432.

When the reverse proxy runs inside the same VM, set `TRACKIT_BIND_ADDRESS=127.0.0.1` in `.env` and
run `docker compose up -d` again. For a proxy on another host, retain `0.0.0.0` and restrict port
3000 with the VM firewall to the proxy address.

Verify before adding real health data:

```bash
curl -f http://127.0.0.1:3000/api/health
docker compose ps
docker compose logs --tail=100 app
```

Then open the HTTPS URL, create the owner account, save the recovery codes, register a passkey, log
out, and verify a new login.

## Updates

After following your infrastructure recovery policy, run the update from the installation directory:

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
```

Database migrations run when the application starts. Do not delete or recreate the Docker volumes
during an update. Review the changelog for version-specific instructions.

## Recovery responsibility

TrackIt does not create or manage backups. Proxmox Backup Server, scheduled vzdump, database
snapshots, and recovery testing are infrastructure responsibilities outside the application.

## LXC notes

If an LXC is required, use an unprivileged container, enable `nesting=1` and `keyctl=1`, and place
Docker data on storage that supports overlay filesystems. Do not use a privileged container merely
to avoid configuration work. If Docker, overlay2, AppArmor, or mount behavior differs from a normal
Debian VM, reproduce the issue in a VM before reporting it as a TrackIt defect.
