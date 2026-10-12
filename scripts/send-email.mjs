#!/usr/bin/env node
/**
 * Send a proposal as rendy@dirory.com, from its email template.
 *
 *   node scripts/send-email.mjs wisma-sehati          # preview (writes an .eml)
 *   node scripts/send-email.mjs wisma-sehati --send   # actually send
 *
 * Why a script at all: the one real hazard in sending eleven proposals by hand is
 * attaching the wrong PDF — the Propan proposal landing in Wisma Sehati's inbox.
 * Here the recipient and the attachment come from the same template file, so they
 * cannot drift apart.
 *
 * Why it authenticates instead of just relaying: dirory.com publishes
 * `DMARC p=reject`, so a message that is not authenticated is not filed as spam —
 * it is dropped. This connects to Mailspace with the mailbox credentials, which is
 * what earns the DKIM signature. See docs/EMAIL.md.
 *
 * No dependencies: SMTP is spoken directly over Node's tls/net, in keeping with the
 * rest of scripts/ (which has never added an npm package for this).
 *
 * Credentials are read from the environment, never from the repo:
 *   SMTP_HOST (default mx4.mailspace.id — the name on the TLS certificate; see
 *              docs/EMAIL.md §2 for why mail.dirory.com fails verification)
 *   SMTP_PORT (default 465; 587 is supported and uses STARTTLS)
 *   SMTP_USER (default rendy@dirory.com)
 *   SMTP_PASS (required to send)
 *   SMTP_FROM (default "Rendy Noor Chandra <rendy@dirory.com>")
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import crypto from "node:crypto";

const ROOT = process.cwd();
const TEMPLATE_DIR = path.join(ROOT, "proposals", "emails");
const OUTBOX = path.join(ROOT, "proposals", "outbox");

const HELP = `
Send a Dirory proposal from its email template.

  node scripts/send-email.mjs <slug> [options]

  <slug>              the proposal slug, e.g. wisma-sehati
                      (reads proposals/emails/<slug>.md, attaches the PDF it names)

Options
  --send              send it. Without this the message is only written to
                      proposals/outbox/<slug>.eml and printed for review.
  --no-save           do not file a copy in the Sent folder over IMAP
  --to <address>      override the recipient (useful to send yourself a test)
  --host <host>       SMTP host     (default $SMTP_HOST or mx4.mailspace.id)
  --port <port>       SMTP port     (default $SMTP_PORT or 465; 587 = STARTTLS)
  --help              this text

Credentials come from the environment: SMTP_PASS is required with --send.
`;

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function parseTemplate(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) {
    throw new Error("template must begin with a '---' front-matter block, then '---'");
  }
  const headers = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  // The body is normalised to CRLF: SMTP is a CRLF protocol, and a bare LF in the
  // DATA block is one of the quiet ways a message gets mangled in transit.
  const body = m[2].trim().replace(/\r?\n/g, "\r\n");
  return { headers, body };
}

function addresses(value, field) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      const addr = (m ? m[1] : s).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
        throw new Error(`${field} address looks wrong: "${s}"`);
      }
      return addr;
    });
}

// ---------------------------------------------------------------------------
// MIME
// ---------------------------------------------------------------------------

function rfc2047(value) {
  // Only encode when it must be: a plain ASCII subject reads better in every
  // client, and avoids an unnecessary encoded-word.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Lines(buf) {
  const b64 = buf.toString("base64");
  const out = [];
  for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
  return out.join("\r\n");
}

function buildMessage({ headers, body, attachments }) {
  const boundary = `dirory-${crypto.randomBytes(12).toString("hex")}`;
  const subject = headers.subject || "(no subject)";

  const parts = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    headers.cc ? `Cc: ${headers.cc}` : null,
    headers["reply-to"] ? `Reply-To: ${headers["reply-to"]}` : null,
    `Subject: ${rfc2047(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(12).toString("hex")}@dirory.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    "This is a message in MIME format.",
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(body, "utf8")),
  ].filter((l) => l !== null);

  for (const a of attachments) {
    parts.push(
      "",
      `--${boundary}`,
      `Content-Type: ${a.mime}; name="${a.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.name}"`,
      "",
      base64Lines(a.data),
    );
  }

  parts.push("", `--${boundary}--`, "");
  // Join with CRLF, but do not double up where a part already ends in one.
  return parts.join("\r\n").replace(/\r\n+$/, "\r\n");
}

function dotStuff(message) {
  // A line consisting of a single "." ends DATA, so a body line that starts with
  // one has to be doubled. Cheap, and skipping it corrupts the message.
  return message.replace(/\r\n\./g, "\r\n..");
}

// ---------------------------------------------------------------------------
// SMTP
// ---------------------------------------------------------------------------

function makeReader(socket) {
  let buf = "";
  const waiters = [];
  let failure = null;

  function takeReply() {
    // A reply is one or more "NNN-..." lines ended by a "NNN ..." line.
    const lines = buf.split("\r\n");
    const acc = [];
    for (let i = 0; i < lines.length - 1; i++) {
      acc.push(lines[i]);
      if (/^\d{3}(?: |$)/.test(lines[i])) {
        buf = buf.slice(acc.join("\r\n").length + 2);
        return { code: Number(lines[i].slice(0, 3)), text: acc.join("\n") };
      }
    }
    return null;
  }

  function pump() {
    for (;;) {
      const reply = takeReply();
      if (reply) {
        const w = waiters.shift();
        if (w) w.resolve(reply);
        else break;
        continue;
      }
      if (failure) {
        while (waiters.length) waiters.shift().reject(failure);
      }
      break;
    }
  }

  socket.on("data", (d) => {
    buf += d.toString("utf8");
    pump();
  });
  socket.on("error", (e) => {
    failure = failure || e;
    pump();
  });
  socket.on("close", () => {
    failure = failure || new Error("connection closed by the server");
    pump();
  });

  return () =>
    new Promise((resolve, reject) => {
      const immediate = takeReply();
      if (immediate) return resolve(immediate);
      if (failure) return reject(failure);
      waiters.push({ resolve, reject });
    });
}

function connect(host, port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const socket =
      port === 465
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`timed out connecting to ${host}:${port}`));
    });
    socket.once("error", reject);
    socket.once(port === 465 ? "secureConnect" : "connect", () => {
      socket.removeListener("error", reject);
      socket.setTimeout(0);
      resolve(socket);
    });
  });
}

async function upgradeTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => {
      secure.removeListener("error", reject);
      resolve(secure);
    });
    secure.once("error", reject);
  });
}

async function smtpSend({ host, port, user, pass, from, recipients, message, log }) {
  let socket = await connect(host, port);
  let read = makeReader(socket);

  const write = (line) => socket.write(line + "\r\n");
  const expect = async (want, what) => {
    const reply = await read();
    const ok = Array.isArray(want) ? want.includes(reply.code) : reply.code === want;
    if (!ok) {
      const shown = reply.text.replace(/\n/g, " | ");
      throw new Error(`${what} failed: ${shown}`);
    }
    return reply;
  };

  await expect(220, `greeting from ${host}:${port}`);
  log(`  connected to ${host}:${port}`);

  write("EHLO dirory.com");
  let ehlo = await expect(250, "EHLO");
  log("  EHLO accepted");

  if (port !== 465) {
    write("STARTTLS");
    await expect(220, "STARTTLS");
    socket = await upgradeTls(socket, host);
    read = makeReader(socket);
    write("EHLO dirory.com");
    ehlo = await expect(250, "EHLO (after STARTTLS)");
    log("  TLS negotiated (STARTTLS)");
  } else {
    log("  TLS negotiated (implicit)");
  }

  const mechanisms = ehlo.text.toUpperCase();
  if (mechanisms.includes("AUTH") && !/AUTH[^\n]*\bLOGIN\b/.test(mechanisms) && /AUTH[^\n]*\bPLAIN\b/.test(mechanisms)) {
    write("AUTH PLAIN " + Buffer.from(`\0${user}\0${pass}`, "utf8").toString("base64"));
    await expect(235, "AUTH PLAIN");
  } else {
    write("AUTH LOGIN");
    await expect(334, "AUTH LOGIN");
    write(Buffer.from(user, "utf8").toString("base64"));
    await expect(334, "username");
    write(Buffer.from(pass, "utf8").toString("base64"));
    await expect(235, "password");
  }
  log("  authenticated as " + user);

  write(`MAIL FROM:<${from}>`);
  await expect(250, "MAIL FROM");
  for (const rcpt of recipients) {
    write(`RCPT TO:<${rcpt}>`);
    await expect([250, 251], `RCPT TO <${rcpt}>`);
  }
  log(`  accepted ${recipients.length} recipient(s)`);

  write("DATA");
  await expect(354, "DATA");
  socket.write(dotStuff(message).replace(/\r\n$/, "") + "\r\n.\r\n");
  await expect(250, "message body");
  log("  message accepted for delivery");

  write("QUIT");
  try {
    await read();
  } catch {
    // Some servers close immediately after QUIT; the message is already accepted.
  }
  socket.end();
  socket.destroy();
}

// ---------------------------------------------------------------------------
// Sent folder
// ---------------------------------------------------------------------------

/**
 * File a copy in the Sent folder over IMAP, the way a mail client does.
 *
 * Sending over SMTP leaves no trace in the mailbox — the server has no reason to
 * keep one. Without this, a founder chasing eleven proposals has no record of
 * which ones went out. A failure here is reported but never fatal: the message
 * has already been accepted by then.
 */
async function appendToSent({ host, port, user, pass, mailbox, message, log }) {
  const socket = tls.connect({ host, port, servername: host });
  let buf = "";
  socket.on("data", (d) => {
    buf += d.toString("utf8");
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (re, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const m = buf.match(re);
      if (m) return m;
      if (Date.now() - t0 > ms) throw new Error(`IMAP did not answer (${re})`);
      await sleep(120);
    }
  };
  const send = (line) => socket.write(line + "\r\n");

  try {
    await waitFor(/^\* OK/m);
    send(`b1 LOGIN "${user}" "${pass}"`);
    const login = await waitFor(/^b1 (OK|NO|BAD)/m);
    if (!/OK/.test(login[0])) throw new Error("IMAP login was refused");

    const bytes = Buffer.byteLength(message, "utf8");
    buf = "";
    send(`b2 APPEND "${mailbox}" (\\Seen) {${bytes}}`);
    await waitFor(/^\+ /m); // "ready for literal data"
    socket.write(message + "\r\n");
    const done = await waitFor(/^b2 (OK|NO|BAD)/m, 30000);
    if (!/OK/.test(done[0])) throw new Error(`APPEND was refused (${done[0].trim()})`);

    send("b3 LOGOUT");
    await sleep(200);
    log(`  copy filed in ${mailbox}`);
  } finally {
    socket.destroy();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || !args.length) {
    console.log(HELP.trim());
    process.exit(args.length ? 0 : 1);
  }

  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) {
    console.error("Missing the proposal slug. Try --help.");
    process.exit(1);
  }

  const templatePath = path.join(TEMPLATE_DIR, `${slug}.md`);
  if (!fs.existsSync(templatePath)) {
    console.error(`No email template at ${templatePath}`);
    const found = fs.existsSync(TEMPLATE_DIR)
      ? fs.readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))
      : [];
    console.error(found.length ? `Available: ${found.join(", ")}` : "No templates yet.");
    process.exit(1);
  }

  const { headers, body } = parseTemplate(fs.readFileSync(templatePath, "utf8"));

  const toOverride = flag(args, "--to");
  const toValue = typeof toOverride === "string" ? toOverride : headers.to;
  if (!toValue) {
    console.error("The template has no 'to:' line, and --to was not given.");
    process.exit(1);
  }
  const recipients = addresses(toValue, "to");
  const fromHeader = process.env.SMTP_FROM || headers.from;
  if (!fromHeader) {
    console.error("No 'from:' in the template and no SMTP_FROM in the environment.");
    process.exit(1);
  }
  const envelopeFrom = (fromHeader.match(/<([^>]+)>/) || [, fromHeader])[1].trim();

  // Attachments
  const attachments = [];
  if (headers.attach) {
    for (const rel of headers.attach.split(",").map((s) => s.trim()).filter(Boolean)) {
      const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        console.error(`The template names an attachment that does not exist: ${rel}`);
        console.error("Build it first:  node scripts/build-proposals.mjs " + slug);
        process.exit(1);
      }
      attachments.push({
        name: path.basename(abs),
        data: fs.readFileSync(abs),
        mime: path.extname(abs).toLowerCase() === ".pdf" ? "application/pdf" : "application/octet-stream",
      });
    }
  }

  const message = buildMessage({ headers: { ...headers, to: toValue, from: fromHeader }, body, attachments });

  console.log(`\n  Template     proposals/emails/${slug}.md`);
  console.log(`  From         ${fromHeader}`);
  console.log(`  To           ${recipients.join(", ")}`);
  console.log(`  Subject      ${headers.subject || "(none)"}`);
  console.log(
    `  Attachment   ${attachments.length ? attachments.map((a) => `${a.name} (${Math.round(a.data.length / 1024)} KB)`).join(", ") : "none"}`,
  );
  console.log(`  Body         ${body.split("\r\n").length} lines`);

  const shouldSend = args.includes("--send");

  if (!shouldSend) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const out = path.join(OUTBOX, `${slug}.eml`);
    fs.writeFileSync(out, message);
    console.log(`\n  Preview only — nothing was sent.`);
    console.log(`  Message written to proposals/outbox/${slug}.eml`);
    console.log(`  To send it:  node scripts/send-email.mjs ${slug} --send\n`);
    return;
  }

  const host = flag(args, "--host") || process.env.SMTP_HOST || "mx4.mailspace.id";
  const port = Number(flag(args, "--port") || process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "rendy@dirory.com";
  const pass = process.env.SMTP_PASS;

  if (typeof host !== "string" || !host) {
    console.error("--host needs a value.");
    process.exit(1);
  }
  if (!Number.isFinite(port)) {
    console.error("--port needs a number.");
    process.exit(1);
  }
  if (!pass) {
    console.error("\n  SMTP_PASS is not set, so nothing can be authenticated.");
    console.error("  dirory.com is DMARC p=reject: an unauthenticated send would be dropped,");
    console.error("  not filtered, so this refuses to try. See docs/EMAIL.md §5.\n");
    process.exit(1);
  }

  console.log("");
  await smtpSend({
    host,
    port,
    user,
    pass,
    from: envelopeFrom,
    recipients,
    message,
    log: (s) => console.log(s),
  });
  console.log("");

  if (!args.includes("--no-save")) {
    try {
      await appendToSent({
        host,
        port: Number(process.env.IMAP_PORT || 993),
        user,
        pass,
        mailbox: process.env.SENT_MAILBOX || "INBOX.Sent",
        message,
        log: (s) => console.log(s),
      });
    } catch (err) {
      // Not fatal: the message has already been accepted for delivery.
      console.log(`  (sent, but no copy was filed in Sent: ${err.message})`);
    }
  }

  console.log(`\n  Sent to ${recipients.join(", ")}.\n`);
}

main().catch((err) => {
  console.error(`\n  Failed: ${err.message}\n`);
  if (/535|authentication/i.test(err.message)) {
    console.error("  535 = wrong password, or a username missing @dirory.com.");
    console.error("  Email docs: docs/EMAIL.md §7\n");
  } else if (/timed out|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
    console.error("  Network problem. Try port 587:  --port 587\n");
  }
  process.exit(1);
});
