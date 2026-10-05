# Dirory — deployment runbook (Sumopod VPS)

The admin dashboard (and the whole web app) runs on your Sumopod VPS behind
Caddy, which gets an HTTPS certificate automatically. Supabase stays in the cloud.

**Read this whole file once before starting.** Steps 0–3 only need doing once.

The app is one Next.js codebase: `admin.dirory.com` shows the dashboard
(`/` is rewritten to `/admin`), and any other host shows the public pages
(`/library`, `/login`, `/download`). See `middleware.ts`.

Never paste passwords or private keys into chat, a commit, or a file in this repo.
The steps below assume SSH keys.

---

## 0. State of play

| Thing | Value |
|---|---|
| Public IP | `129.226.208.234` |
| Private IP | `10.3.8.254` (Sumopod-internal; not a secret) |
| Username | `ubuntu` |
| Domain | `dirory.com`, managed at Domainesia |
| Staging | Netlify, at `cheerful-arithmetic-490036.netlify.app` |

**The password you shared in chat must be considered compromised.** Change it on
first login and switch to SSH keys (steps 2–3).

## 1. DNS — point `admin.dirory.com` at this server

Today `admin.dirory.com` is a CNAME to Netlify. For production it must be an
`A` record to the VPS:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `admin` | `129.226.208.234` | 300 (lower it while setting up) |

**Delete the existing CNAME first** — an `A` and a `CNAME` cannot both exist.

Leave `dirory.com` and `www` pointing at Netlify unless you also want the public
site on the VPS. Mail records (`MX`, `A mail`, SPF, DMARC) must not change.

Verify before continuing — Caddy cannot issue a certificate until this resolves:

```bash
nslookup admin.dirory.com        # must return 129.226.208.234
```

## 2. First login and SSH keys

```bash
ssh ubuntu@129.226.208.234          # with the password, once
```

Change the password, then install your key:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys         # paste your PUBLIC key (~/.ssh/id_ed25519.pub)
chmod 600 ~/.ssh/authorized_keys
```

Test **in a second terminal** before closing the first — never lock yourself out:

```bash
ssh ubuntu@129.226.208.234          # should not ask for a password
```

## 3. Harden the server

```bash
# 3.1 Disable password and root login
sudo nano /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
#   PubkeyAuthentication yes
sudo systemctl restart ssh

# 3.2 Firewall: only SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status

# 3.3 Automatic security updates
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades

# 3.4 fail2ban for SSH
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled  = true
port     = 22
maxretry = 4
bantime  = 1h
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Keep the first SSH session open until you have confirmed a second one still works
after each change.

## 4. Install Docker

```bash
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
docker run --rm hello-world
```

## 5. Get the code onto the server

```bash
sudo apt install -y git
git clone https://github.com/rendynoor25/dirory.git dirory
cd dirory
```

The repository is private, so `git clone` will ask for credentials once. Use a
GitHub personal access token as the password (Settings → Developer settings →
Personal access tokens), or add a deploy key under the repo's Deploy keys.

## 6. Configure the environment

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

`.env.example` lists every name with a comment. Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://ajlmncbzufagplbaaukv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key, sb_publishable_…>
SUPABASE_SERVICE_ROLE_KEY=<secret key, sb_secret_…>
NEXT_PUBLIC_SITE_URL=https://admin.dirory.com
NEXT_PUBLIC_ADMIN_HOST=admin.dirory.com
DOMAIN=admin.dirory.com
```

The first four are public values baked into the client bundle at **build** time.
`SUPABASE_SERVICE_ROLE_KEY` is server-only: it is passed at runtime and must never
reach the browser. `DOMAIN` is what Caddy requests a certificate for.

## 7. Deploy

```bash
./scripts/deploy.sh
```

That pulls the latest code, builds the image and starts the app plus Caddy. The
script waits for the app to report healthy, then checks HTTPS. Caddy requests the
certificate itself on first start, so the very first run can take a minute.

```bash
curl -I https://admin.dirory.com/api/health     # expect HTTP 200
docker compose logs -f caddy                    # certificate progress
docker compose logs -f web                      # app logs
```

## 8. Supabase redirect URLs

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://admin.dirory.com`
- **Redirect URLs**: add `https://admin.dirory.com/auth/callback`

Without this, sign-in fails back to `/login`. (`dirory.com/auth/callback` is
already listed for the public site.)

## 9. Make yourself admin

Sign in once in the browser, then in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'your@email.com');
```

Then visit `https://admin.dirory.com` — `/` is rewritten to the dashboard.

## 10. Verify

```bash
curl -s https://admin.dirory.com/api/health     # {"status":"ok",...}
sudo ufw status                                  # 22, 80, 443 only
sudo fail2ban-client status sshd                 # a jail is running
docker compose ps                                # web healthy, caddy up
```

Then walk the acceptance list: sign in as admin, approve a vendor and an asset,
and check the audit log. The public catalogue at `dirory.com/library` should keep
working from Netlify regardless of this deployment.

---

## Routine operations

```bash
docker compose logs -f web        # follow app logs
docker compose ps                 # what is running
./scripts/deploy.sh               # update to the latest code
docker compose restart web        # restart just the app
```

**Backups.** The database lives in Supabase, not on this server, so a lost VPS
loses only the deployment, not the data. Enable Supabase's scheduled backups
(Pro plan) or run `pg_dump` on a schedule against the pooled connection string.

**Rotating the service-role key.** Supabase → Project Settings → API → rotate,
then update `.env` and `./scripts/deploy.sh`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Caddy logs "no such host" | DNS not propagated | Check `nslookup`; wait |
| Certificate never issued | Port 80 blocked | `sudo ufw status`; must allow 80 |
| 502 from Caddy | App not up yet | `docker compose logs web` |
| Can't SSH after hardening | Key not installed | Use the Sumopod console to revert `sshd_config` |
| Magic link lands on `/login` | Redirect URL missing | Step 8 |
| Admin page redirects to `/vendor` | Role not set | Step 9 |
