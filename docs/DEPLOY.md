# Dirory — deployment runbook (Sumopod VPS)

Written for the Sumopod VPS you have already bought. Follow it in order.

**Current state:** you have an IP, a username and no domain. That means you are at
**step 0**, not step 4. Caddy cannot obtain an HTTPS certificate until a domain
resolves to the server, so the domain comes first.

Never paste passwords or private keys into chat, a commit, or a file in this repo.
The steps below assume SSH keys.

---

## 0. First: the credentials you already shared

You sent the public IP, the private IP and the username `ubuntu` in a chat.

1. **Change the password immediately** on first login.
2. **Then replace it with an SSH key** (step 2) and disable password login (step 3).
3. The **private IP (`10.3.8.254`) is not a secret** — it is only reachable inside
   Sumopod's network — but the public IP plus a leaked password is a real risk.
   Treat the password as compromised from the moment it was pasted into a chat.

## 1. The domain (do this first — nothing else works without it)

Buy a `.com` if you want `admin.<yourdomain>.com` as the brief specifies. Any
registrar works; Cloudflare Registrar sells at cost with no markup.

Then add a DNS record:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `admin` | `129.226.208.234` | 300 (lower it while setting up) |

Verify from your own machine before continuing:

```bash
nslookup admin.yourdomain.com
```

It must return `129.226.208.234`. Do not go on until it does. DNS can take 15–30
minutes; a 300 s TTL keeps that short.

## 2. First login and SSH keys

From your laptop (replace the path to your key):

```bash
ssh ubuntu@129.226.208.234          # with the password, once
```

On the server, create your own key access:

```bash
# Option A: you already have a key — paste the PUBLIC key (id_ed25519.pub)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys         # paste one line per key
chmod 600 ~/.ssh/authorized_keys
```

Test **in a second terminal** before closing the first — never lock yourself out:

```bash
ssh ubuntu@129.226.208.234          # should log in without a password prompt
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
git clone <your-repo-url> dirory
cd dirory
```

## 6. Configure the environment

Create `.env` on the server (never commit it). Use `apps/web/.env.example` as the
list of names; the values come from Supabase → Project Settings → API.

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Required names:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://admin.yourdomain.com
DOMAIN=admin.yourdomain.com
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never reach the browser.

## 7. Deploy

```bash
./scripts/deploy.sh
```

That builds the image and starts the app plus Caddy. Caddy requests the TLS
certificate on first start; give it a minute, then:

```bash
curl -I https://admin.yourdomain.com/api/health     # expect HTTP 200
docker compose logs -f caddy                        # certificate progress
docker compose logs -f web                          # app logs
```

## 8. Supabase redirect URLs

In Supabase → Authentication → URL Configuration set:

- **Site URL**: `https://admin.yourdomain.com`
- **Redirect URLs**: add `https://admin.yourdomain.com/auth/callback`

Without this, magic-link sign-in fails silently.

## 9. Make yourself admin

Sign in once in the browser, then in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## 10. Verify

```bash
curl -I https://admin.yourdomain.com/api/health
sudo ufw status
sudo fail2ban-client status sshd
```

Then walk the acceptance list: log in as admin, approve a vendor, approve an asset,
upload the library, and check the audit log.

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
