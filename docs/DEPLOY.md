# Dirory — deployment runbook (Sumopod VPS)

The whole web app runs on your Sumopod VPS behind Caddy, which gets an HTTPS
certificate automatically. Supabase stays in the cloud.

**Read this whole file once before starting.** Steps 0–3 only need doing once.

**One domain.** Everything is served from `dirory.com`:

| Path | What it is |
|---|---|
| `/` | public landing page |
| `/library`, `/product/<id>` | public product catalogue |
| `/login`, `/download` | architect sign-in and plugin download |
| `/auth/device` | the plugin's sign-in approval page |
| `/admin` | the back-office (role-gated; only admins see it) |

There is no separate `admin.` subdomain. That keeps one certificate, one cookie
scope, and sign-in that works across the whole site.

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
| Staging | Netlify, at `cheerful-arithmetic-490036.netlify.app` (no longer used for production) |

**The password you shared in chat must be considered compromised.** Change it on
first login and switch to SSH keys (steps 2–3).

## 1. DNS — point `dirory.com` at this server

Today `dirory.com` points at Netlify. For production it must be an `A` record to
the VPS:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `129.226.208.234` | 300 (lower it while setting up) |

Also point `www` at the server (a `CNAME` to `dirory.com` is fine).

**Leave the mail records alone** — `MX @`, `A mail`, SPF, DMARC and DKIM provide
your Mailspace email. Only the website records change.

If `admin.dirory.com` exists as a CNAME to Netlify, you may leave or delete it;
nothing uses it once everything is on `dirory.com`.

Verify before continuing — Caddy cannot issue a certificate until this resolves:

```bash
nslookup dirory.com              # must return 129.226.208.234
```

DNS can take 15–30 minutes; a 300 s TTL keeps that short.

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

Run these on the server. Keep your first SSH session open until you have
confirmed a second one still works after each change.

```bash
# 3.1 SSH: key-only, no root login
#
# IMPORTANT: Ubuntu cloud images ship /etc/ssh/sshd_config.d/50-cloud-init.conf
# which sets `PasswordAuthentication yes`, and the main sshd_config also has it.
# sshd uses FIRST-match-wins, and the drop-ins load alphabetically, so a file
# named 99- loses to 50-. Name yours 00- so it wins.
sudo tee /etc/ssh/sshd_config.d/00-dirory-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
sudo sshd -t                      # syntax check before restarting
sudo systemctl restart ssh
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'
#   expect: passwordauthentication no / permitrootlogin no / pubkeyauthentication yes

# 3.2 Firewall: allow SSH BEFORE enabling, or you lock yourself out
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose

# 3.3 Automatic security updates (already enabled on most cloud images)
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades

# 3.4 fail2ban for SSH
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled  = true
port     = 22
maxretry = 4
bantime  = 1h
findtime = 10m
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

**Verify you are not locked out** before closing anything:

```bash
# in a NEW terminal — must connect without a password
ssh -i ~/.ssh/yourkey ubuntu@129.226.208.234
```


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
NEXT_PUBLIC_SITE_URL=https://dirory.com
DOMAIN=dirory.com
```

The first two are public values baked into the client bundle at **build** time.
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
curl -I https://dirory.com/api/health     # expect HTTP 200
docker compose logs -f caddy              # certificate progress
docker compose logs -f web                # app logs
```

## 8. Supabase redirect URLs

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://dirory.com`
- **Redirect URLs**: `https://dirory.com/auth/callback` (already listed) and
  `http://localhost:3000/auth/callback` for local work.

Without the redirect entry, sign-in fails back to `/login`. If you previously
added `admin.dirory.com/auth/callback`, it is now unused and can be removed.

## 9. Make yourself admin

Sign in once in the browser, then in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'your@email.com');
```

Then visit `https://dirory.com/admin`.

## 10. Verify

```bash
curl -s https://dirory.com/api/health            # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' https://dirory.com/library   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://dirory.com/          # 200
sudo ufw status                                   # 22, 80, 443 only
sudo fail2ban-client status sshd                  # a jail is running
docker compose ps                                 # web healthy, caddy up
```

Then walk the acceptance list: sign in as admin, approve a vendor and an asset,
and check the audit log.

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
