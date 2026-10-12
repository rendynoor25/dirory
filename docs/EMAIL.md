# Dirory — sending email as `rendy@dirory.com`

How to send a proposal (or anything else) from the real domain mailbox, and why it
must be sent the way it is.

If you only read one line: **send it through Mailspace** — the webmail at
<https://mail.dirory.com>, Gmail's "Send mail as", or `scripts/send-email.mjs`.
Never from the VPS.

---

## 1. Where the mailbox actually lives

`dirory.com` mail is hosted by **Mailspace**, not by the site. This is the part
that surprises people: the website runs on the Sumopod VPS, and the email does
not. They share a domain name and nothing else.

| | |
|---|---|
| Webmail | <https://mail.dirory.com> (also `https://mailspace.id`) |
| Mail server | `mx4.mailspace.id` — also reachable as `mail.dirory.com`; both `36.50.77.49` |
| Incoming (MX) | `mx4.mailspace.id` → `36.50.77.49` |
| Server software | Exim 4.100.1 (`220-mx4.mailspace.id ESMTP Exim 4.100.1`) |

The mailbox is a normal `user@domain` account on that server. Your login is the
full address, **`rendy@dirory.com`**, and the password is the one Mailspace gave
you when the mailbox was created (it is not your Domainesia, Supabase or VPS
password).

---

## 2. Client settings

Use these whether you are setting up Gmail's "Send mail as", Outlook, Apple Mail,
Thunderbird, or the script in §5.

| Setting | Value |
|---|---|
| **Server (both ways)** | `mx4.mailspace.id` |
| **SMTP (send)** | port **465** SSL/TLS — or **587** STARTTLS |
| **IMAP (read)** | port **993** SSL/TLS |
| Username | `rendy@dirory.com` (the whole address) |
| Password | the mailbox password |

**Use `mx4.mailspace.id`, not `mail.dirory.com`.** Both names point at the same
machine (`36.50.77.49`) and both accept a connection, but the mail service's TLS
certificate is issued for `mx4.mailspace.id` alone:

```
mail.dirory.com:465   CN=mx4.mailspace.id   SAN=DNS:mx4.mailspace.id
mail.dirory.com:993   CN=mx4.mailspace.id   SAN=DNS:mx4.mailspace.id
```

So `mail.dirory.com` connects and *then* fails with "hostname does not match
certificate" — the usual reason a mail client refuses to save the account. The
`mail.dirory.com` certificate is valid for the **webmail website** only, which is
why the webmail URL is fine and the SMTP/IMAP host is not. (Verified: the webmail
HTTPS certificate validates; the SMTP one does not.)

Both 465 and 587 are reachable. 465 is the default here.

---

## 3. Why not send it some other way

Four routes look reasonable and three of them do not work. This matters because
the failure is silent: the message appears to send, then does not arrive.

| Route | Verdict |
|---|---|
| **Through Mailspace** (webmail, Gmail, script) | **Correct.** Mailspace signs with DKIM (`default._domainkey.dirory.com` exists) and is named in SPF, so the mail authenticates properly. |
| **From the VPS** (`129.226.208.234` via sendmail/Node) | **Blocked.** Outbound port 25 is closed on the VPS, and the IP has no PTR (reverse DNS), so receiving servers would distrust it. It also would not be DKIM-signed. |
| **A transactional service** (Resend, SendGrid, Mailgun) | **Would be rejected.** They send from their own IPs, so the domain must name them in SPF and hold their DKIM key. |
| **Whatever your phone/desktop is already set up to do** | Probably fine — if it is authenticating to `mail.dirory.com`. If it sends as `@gmail.com`, the proposal arrives from a stranger. |

`dirory.com` publishes:

```
TXT  @       v=spf1 a mx include:relay.mailchannels.net ~all
TXT  _dmarc  v=DMARC1; p=reject; rua=mailto:dmarc@dirory.com
```

**`p=reject` is the important part.** It tells every receiving server: if a
message claims to be from `@dirory.com` and is not authenticated, reject it
outright — do not even put it in spam. So an unsigned message from the VPS or
from Resend does not land in spam; it vanishes.

That is also why the rules hold: **never edit MX, SPF, DMARC or DKIM.** There is
nothing to add. Mailspace already provides the DKIM key and appears in SPF; any
change risks breaking working mail to fix a problem that does not exist.

---

## 4. Sending it — the simple way (webmail)

Recommended for the proposals. One email per person, ~2 minutes each.

1. Open <https://mail.dirory.com> and sign in as `rendy@dirory.com`.
2. **Compose**. In **From**, make sure it says `rendy@dirory.com` — not an alias,
   not a personal address.
3. **To**: the recipient from the proposal's email template, e.g.
   `dederiane.hunara@wismasehati.com`.
4. **Subject** and **body**: copy them from `proposals/emails/<slug>.md`. That
   file holds the exact subject line and the finished Bahasa Indonesia body —
   paste it in, do not retype it.
5. **Attach** the matching PDF: `proposals/<slug>.pdf`.
6. Read it once more, then send.

> **Attach the right file.** The one real hazard in this workflow is sending the
> Propan proposal to Wisma Sehati. The filename is the check: the slug in the
> attachment must match the slug in the email template.

### Sending from Gmail instead

Gmail can send *as* the domain address while you keep using Gmail, which is handy
on a phone.

Gmail → **Settings** → **Accounts and Import** → *Send mail as* → **Add another
email address** → name `Rendy Noor Chandra`, email `rendy@dirory.com` → **Next**
→ fill in SMTP `mx4.mailspace.id`, port **465**, username `rendy@dirory.com`, the
mailbox password, "Secured connection using SSL" → **Add account**.

Gmail then sends a confirmation code to the mailbox. Read it in the webmail, or
in Gmail itself once IMAP is set up, and paste the code. After that,
`rendy@dirory.com` appears in the From dropdown when you compose.

---

## 5. Sending it — the script

For when you would rather not attach files by hand. It builds the message from
the template, attaches the right PDF, and can either preview or send it.

```bash
node scripts/send-email.mjs wisma-sehati            # preview: writes an .eml
node scripts/send-email.mjs wisma-sehati --send     # actually send it
```

The preview mode needs no password and sends nothing — it writes
`proposals/outbox/wisma-sehati.eml`, a complete message you can inspect (or open
in a mail client). Use it to confirm the recipient and attachment before sending.

Sending needs the mailbox password. Keep it **out of the repository** — put it in
the environment:

```powershell
$env:SMTP_PASS = "…"                               # PowerShell
node scripts/send-email.mjs wisma-sehati --send
```

```bash
export SMTP_PASS='…'                               # bash
node scripts/send-email.mjs wisma-sehati --send
```

Optional overrides: `SMTP_HOST` (default `mx4.mailspace.id`), `SMTP_PORT`
(default `465`), `SMTP_USER` and `SMTP_FROM`.

---

## 6. Rules worth keeping

- **One email at a time, addressed by name.** Not BCC, not a list. The Exim
  banner on the mail server says it plainly: *"We do not authorize the use of this
  system to transport unsolicited or bulk e-mail."* Eleven personal emails are
  not bulk; a hundred BCCs are, and would put the domain at risk.
- **Use `Ibu` / `Bapak`.** The templates already do.
- **Do not change someone's honorific or title** without checking. Where a title
  is unknown, the proposal omits it rather than guessing.
- **The reply goes to `rendy@dirory.com`** — keep it that way, so the thread stays
  in the mailbox you can actually read.
- **If a send fails, do not retry ten times.** Read the error first (§7); repeated
  failed AUTH attempts can get the IP throttled.

---

## 7. When something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `535 authentication failed` | Wrong password, or username without `@dirory.com` | Username is the **full** address. If the password is lost, reset it in the Mailspace panel — this is the same login that was blocking magic-link sign-in |
| `Connection timed out` on port 465 | Network blocking that port | Try port **587** (`SMTP_PORT=587`) |
| "hostname does not match certificate" | Host set to `mail.dirory.com` | Use `mx4.mailspace.id` — the certificate does not cover the other name (§2) |
| `554 ... SPF` or `DMARC` on the *recipient* side | Sending from the VPS, or From set to a personal address | §3 — send through Mailspace, with From `rendy@dirory.com` |
| Message sent but never arrives | Sent from the VPS (blocked, silently dropped) | §3. Check the **Sent** folder in webmail — if it is not there, the mail never went through Mailspace |
| Arrives but the PDF is missing | Attachment too large, or not attached | The PDFs are ~1.1 MB, well under any limit — it was not attached |

To confirm a message left correctly, **send yourself a copy** (`rendy@dirory.com`
to `rendy@dirory.com`) and look at the raw headers in webmail: you should see
`dkim=pass header.d=dirory.com` and `spf=pass`. If both pass, recipients will see
the same.

---

## 8. The emails

Templates live in `proposals/emails/`, one file per recipient, named after the
proposal slug. Each is a YAML-style header followed by the finished body:

```
---
to: dederiane.hunara@wismasehati.com
from: Rendy Noor Chandra <rendy@dirory.com>
subject: …
attach: proposals/wisma-sehati.pdf
---

<body, ready to paste>
```

The `attach:` path is what the script uses, so keep it in step with `to:` when
adding a recipient — that pairing is the whole safety mechanism.
