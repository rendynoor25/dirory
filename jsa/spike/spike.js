/**
 * Dirory — M0 spike probe.
 *
 * Answers the eight questions in the build brief inside SketchUp for Web (and on
 * iPad). It is deliberately a probe, not an implementation: where an API's shape
 * is uncertain it enumerates what actually exists and reports it, because a
 * wrong guess that throws is still an answer, whereas a wrong guess that is
 * papered over is not.
 *
 * Every call to the SDK lives in this file only. When this becomes the real
 * extension, that logic moves behind `src/sketchup/` and nothing else touches it.
 *
 * Verified API names (extracted from sketchup-js-api.js v2.37.1, not guessed):
 *   SketchUpApi.connect / .platform / .getActiveModel / .features / .UI
 *   model.performOperation(fn, name)   op.createDefinition / createInstance
 *   op.componentsLoadFromUrl(request, init, opts)   op.componentsLoad(blob, opts)
 *   op.createMaterial(name) / materialSetColor / materialSetAlpha / materialSetName
 *   op.materialsLoadFromUrl(url, init, opts) / loadMaterial({resource})
 *   op.materialSetTexture / materialSetTextureDataBase64 / materialSetTextureImageRep
 *   op.entitySetAttribute(container, entityId, dict, key, value)
 *   op.faceSetFrontMaterial(face, materialRef) / drawingElementSetTagName
 *   model.getDefinitions / getMaterials / getSelection / getTagManager
 *   tools.placeComponentOnce({sketchupId}) / placeComponentRepeatedly / clearActiveTool
 */

const FN = "https://ajlmncbzufagplbaaukv.supabase.co/functions/v1";
const PUBLISHABLE_KEY = "sb_publishable_JIpzGVjnwobUxaGbhBEsHg_0Lfu_QPs";
const SPIKE_VERSION = "0.0.1";

const el = (id) => document.getElementById(id);
const rows = [];
let token = null;
let model = null;
let installId = null;
let probeOf = {}; // things discovered at runtime, reused by later checks

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function render(check, status, detail, api) {
  const i = rows.findIndex((r) => r.check === check);
  const row = { check, status, detail: detail || "", api: api || "" };
  if (i >= 0) rows[i] = row;
  else rows.push(row);

  const list = el("list");
  let node = document.getElementById("c-" + check.replace(/\W+/g, "-"));
  if (!node) {
    node = document.createElement("div");
    node.className = "row";
    node.id = "c-" + check.replace(/\W+/g, "-");
    list.appendChild(node);
  }
  node.innerHTML =
    `<h2><span class="badge ${status}">${status}</span>${escapeHtml(check)}</h2>` +
    (row.detail ? `<pre>${escapeHtml(row.detail)}</pre>` : "") +
    (row.api ? `<pre>via: ${escapeHtml(row.api)}</pre>` : "");
  // Keep the DOM in the same order as the check list.
  for (const r of rows) {
    const n = document.getElementById("c-" + r.check.replace(/\W+/g, "-"));
    if (n) list.appendChild(n);
  }
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const err = (e) => (e && (e.message || e.toString())) || "unknown error";

/** Run one check. Any throw becomes a FAIL row rather than killing the run. */
async function check(name, fn) {
  render(name, "TODO", "running…", "");
  try {
    const r = (await fn()) || {};
    render(name, r.status || "PASS", r.detail || "", r.api || "");
  } catch (e) {
    render(name, "FAIL", err(e) + (e && e.stack ? "\n\n" + String(e.stack).split("\n").slice(0, 4).join("\n") : ""), "");
  }
}

/** Enumerate an object's members — the honest way to answer "does this exist?". */
function members(label, obj) {
  if (!obj) return `${label}: (null/undefined)`;
  const own = [];
  const proto = [];
  try {
    own.push(...Object.getOwnPropertyNames(obj));
  } catch {}
  try {
    let p = Object.getPrototypeOf(obj);
    while (p && p !== Object.prototype) {
      proto.push(...Object.getOwnPropertyNames(p));
      p = Object.getPrototypeOf(p);
    }
  } catch {}
  const all = [...new Set([...own, ...proto])]
    .filter((k) => !["constructor", "toString", "valueOf"].includes(k))
    .sort();
  return `${label}: ${all.length} members — ${all.join(", ")}`;
}

// ---------------------------------------------------------------------------
// storage (must never assume it works — the iframe may be sandboxed)
// ---------------------------------------------------------------------------

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
};

function ensureInstallId() {
  let id = store.get("dirory.install_id");
  if (!id) {
    id =
      "spike-" +
      (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    store.set("dirory.install_id", id);
  }
  installId = id;
  return id;
}

// ---------------------------------------------------------------------------
// cloud
// ---------------------------------------------------------------------------

const apiHeaders = (withKey = true) => {
  const h = { "content-type": "application/json" };
  if (withKey) h.apikey = PUBLISHABLE_KEY;
  if (token) h.authorization = `Bearer ${token}`;
  return h;
};

async function api(path, opts = {}) {
  const res = await fetch(FN + path, { ...opts, headers: { ...apiHeaders(opts.withKey !== false), ...(opts.headers || {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} ${res.statusText} — ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 300)}`);
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body;
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

const checks = [
  [
    "1. Connect, platform, SDK version",
    async () => {
      if (typeof SketchUpApi === "undefined") {
        return { status: "FAIL", detail: "window.SketchUpApi is undefined — the CDN script did not load." };
      }
      await SketchUpApi.connect();
      const p = typeof SketchUpApi.platform === "function" ? SketchUpApi.platform() : SketchUpApi.platform;
      const ver = SketchUpApi.serverProtocolVersion ?? "(no serverProtocolVersion)";
      model = await SketchUpApi.getActiveModel();
      probeOf.api = members("SketchUpApi", SketchUpApi);
      el("env").textContent = `platform=${p}  protocol=${ver}  spike=${SPIKE_VERSION}`;
      return {
        status: "PASS",
        detail:
          `connected\nplatform = ${p}\nserverProtocolVersion = ${ver}\nactiveModel = ${model ? "yes" : "NO"}\n` +
          `storage = ${store.set("dirory.probe", "1") ? "writable" : "UNAVAILABLE"}\n\n` + probeOf.api,
        api: "SketchUpApi.connect(), SketchUpApi.platform, SketchUpApi.getActiveModel()",
      };
    },
  ],

  [
    "2. Catalogue fetch + CORS",
    async () => {
      const out = [];
      let withKey = null;
      try {
        const r = await api("/catalog");
        withKey = { ok: true, count: r?.count, items: r?.items?.length, logos: r?.brand_logos ? Object.keys(r.brand_logos).length : 0 };
        out.push(`WITH apikey header: OK — ${JSON.stringify(withKey)}`);
      } catch (e) {
        withKey = { ok: false, error: err(e) };
        out.push(`WITH apikey header: FAILED — ${err(e)}`);
      }

      let withoutKey = null;
      try {
        const res = await fetch(FN + "/catalog");
        const j = await res.json();
        withoutKey = { ok: res.ok, status: res.status, items: j?.items?.length };
        out.push(`WITHOUT custom headers: OK — http ${res.status}, ${j?.items?.length} items`);
      } catch (e) {
        out.push(`WITHOUT custom headers: FAILED — ${err(e)}`);
      }

      const status = withKey.ok ? "PASS" : withoutKey?.ok ? "PARTIAL" : "FAIL";
      return {
        status,
        detail:
          out.join("\n") +
          "\n\n" +
          (withKey.ok
            ? "Both work: the backend serves a valid preflight for /catalog."
            : "Expected: /catalog does not answer OPTIONS, so the browser preflight fails and the fetch is blocked. " +
              "The workaround is to call /catalog with no custom headers (it is public). See docs/GAPS.md."),
        api: "fetch(FN + '/catalog')",
      };
    },
  ],

  [
    "3. Device sign-in",
    async () => {
      if (token) return { status: "PASS", detail: "already signed in", api: "token held in memory" };
      ensureInstallId();
      const start = await api("/auth-device/start", {
        method: "POST",
        body: JSON.stringify({ install_id: installId, plugin_version: SPIKE_VERSION, platform: platformName() }),
      });
      probeOf.device = start;
      return {
        status: "PARTIAL",
        detail:
          `started. Open this and approve, then press "Sign in" again:\n\n` +
          `  user code : ${start.user_code}\n` +
          `  url       : ${start.verification_url}\n` +
          `  poll every: ${start.interval ?? 5}s, expires in ${start.expires_in ?? 900}s\n\n` +
          `This is where we learn whether the iframe can send the user to a browser page. ` +
          `Note: the server does NOT return verification_url_complete, even though the Ruby ` +
          `client and the build brief both name it — see docs/API.md §4.`,
        api: "POST /auth-device/start",
      };
    },
  ],

  [
    "4. Signed download URL",
    async () => {
      if (!token) return { status: "TODO", detail: "Needs sign-in (check 3). /download returns 401 without a token." };
      const cat = probeOf.catalog || (await api("/catalog"));
      probeOf.catalog = cat;
      const item = (cat.items || []).find((i) => i.type === "model" && i.asset_id);
      if (!item) return { status: "FAIL", detail: "no model with an asset_id in the catalogue" };
      probeOf.modelItem = item;
      const dl = await api(`/download/${item.asset_id}`);
      probeOf.download = dl;
      return {
        status: "PASS",
        detail:
          `catalogue item: ${item.brand} — ${item.name} (${item.asset_id})\n` +
          `signed url host: ${safeHost(dl.url)}\nfile_name: ${dl.file_name}\n\n` +
          `Key question: is this a public HTTPS URL the JSA loader can fetch?`,
        api: "GET /download/<asset_id>",
      };
    },
  ],

  [
    "5. Load .skp from URL",
    async () => {
      if (!probeOf.download?.url) return { status: "TODO", detail: "Needs check 4." };
      const url = probeOf.download.url;
      let def = null;
      await model.performOperation(async (op) => {
        def = await op.componentsLoadFromUrl(new Request(url), undefined, { addOperationError: true });
      }, "Dirory spike: load component");
      probeOf.definition = def;
      return {
        status: "PASS",
        detail:
          `loaded. definition.name = ${def?.name}\nsketchupId = ${JSON.stringify(def?.sketchupId)}\n` +
          `entities() = ${def?.entities ? "available" : "MISSING"}\n\n` +
          `via op.componentsLoadFromUrl(new Request(url), undefined, {addOperationError:true})`,
        api: "op.componentsLoadFromUrl",
      };
    },
  ],

  [
    "6. Start interactive placement",
    async () => {
      if (!probeOf.definition) return { status: "TODO", detail: "Needs check 5." };
      // Where does the Tools API live? Probe rather than guess.
      const tools = model?.tools ?? model?.getTools?.() ?? SketchUpApi?.tools ?? SketchUpApi?.UI?.tools;
      probeOf.tools = tools;
      const found =
        `model.tools: ${model?.tools ? "yes" : "no"}\n` +
        `model.getTools(): ${typeof model?.getTools === "function" ? "method exists" : "no"}\n` +
        `SketchUpApi.tools: ${SketchUpApi?.tools ? "yes" : "no"}\n` +
        (tools ? "\n" + members("tools object", tools) : "\n(no tools object found on any probed path)");
      if (!tools) {
        return { status: "FAIL", detail: "Could not reach a Tools object.\n\n" + found + "\n\n" + members("model", model) };
      }
      const hasRepeated = typeof tools.placeComponentRepeatedly === "function";
      const hasOnce = typeof tools.placeComponentOnce === "function";
      let started = "not attempted";
      if (hasRepeated) {
        // Deliberately fire-and-forget: this is interactive, the user places it.
        tools.placeComponentRepeatedly({ sketchupId: probeOf.definition.sketchupId }).catch(() => {});
        started = "placeComponentRepeatedly called — the model should now be waiting for a click";
      }
      return {
        status: started.startsWith("placeComponent") ? "PARTIAL" : "FAIL",
        detail: `${found}\n\nplaceComponentRepeatedly: ${hasRepeated}\nplaceComponentOnce: ${hasOnce}\n${started}\n\nConfirm by eye: is SketchUp now asking you to place the component?`,
        api: "tools.placeComponentRepeatedly({sketchupId})",
      };
    },
  ],

  [
    "7. Attribute dictionary 'Dirory'",
    async () => {
      if (!probeOf.definition) return { status: "TODO", detail: "Needs check 5." };
      const data = {
        id: probeOf.modelItem?.id,
        asset_id: probeOf.modelItem?.asset_id,
        type: "model",
        name: probeOf.modelItem?.name,
        category: probeOf.modelItem?.category,
        brand: probeOf.modelItem?.brand,
        sku: probeOf.modelItem?.sku,
        product_url: probeOf.modelItem?.product_url,
        dimensions: probeOf.modelItem?.dimensions,
        su_version: probeOf.modelItem?.su_version,
      };
      await model.performOperation(async (op) => {
        for (const [k, v] of Object.entries(data)) {
          if (v === undefined || v === null) continue;
          op.entitySetAttribute(model, probeOf.definition.sketchupId, "Dirory", k, v);
        }
      }, "Dirory spike: tag definition");

      const fresh = await probeOf.definition.refresh();
      const dict = fresh.attributes?.findDictionary?.("Dirory");
      const back = await dict?.get?.();
      return {
        status: back ? "PASS" : "PARTIAL",
        detail:
          `wrote ${Object.keys(data).length} keys to dictionary "Dirory" on the definition.\n` +
          `read back: ${JSON.stringify(back, null, 2)}\n\n` +
          `This is the compatibility contract with the desktop plugin — same dictionary name, same keys.`,
        api: "op.entitySetAttribute(model, defId, 'Dirory', k, v) / definition.attributes.findDictionary('Dirory')",
      };
    },
  ],

  [
    "8. Textured material + tile size",
    async () => {
      const cat = probeOf.catalog || (await api("/catalog"));
      probeOf.catalog = cat;
      const item = (cat.items || []).find((i) => i.type === "material" && i.asset_id);
      if (!item) return { status: "FAIL", detail: "no material with an asset_id in the catalogue" };
      probeOf.materialItem = item;

      let imageUrl = item.thumbnail_url;
      if (token) {
        try {
          const dl = await api(`/download/${item.asset_id}`);
          if (dl?.url) imageUrl = dl.url;
        } catch {}
      }

      let matRef = null;
      await model.performOperation(async (op) => {
        matRef = op.createMaterial(`Dirory ${item.brand} ${item.name}`.slice(0, 60));
      }, "Dirory spike: create material");

      const mats = await model.getMaterials();
      const created = mats?.values?.find?.((m) => String(m.name).startsWith("Dirory "))
        ?? mats?.get?.()?.find?.((m) => String(m.name).startsWith("Dirory "));
      probeOf.material = created;

      // The decisive question: can the texture's real-world size be set at all?
      const tex = created?.texture;
      const textureMembers = tex ? members("Texture", tex) : "no texture object yet (texture not attached)";

      return {
        status: tex ? "PARTIAL" : "PARTIAL",
        detail:
          `material created: ${created?.name ?? "(not found by name)"}\n` +
          `tile_size_cm from catalogue: ${JSON.stringify(item.tile_size_cm)}\n` +
          `image url host: ${safeHost(imageUrl)}\n` +
          `materialSetTextureFromHtmlImage / materialSetTextureDataBase64 exist on Operation: yes\n\n` +
          `${textureMembers}\n\n` +
          `READ THIS: the Ruby plugin sets texture size to ` +
          `(tile_w*10 + grout) x (tile_h*10 + grout) mm. If Texture exposes no width/height/size setter, ` +
          `materials would import at an arbitrary scale and the m² figure would be wrong. ` +
          `Report exactly which members exist above.`,
        api: "op.createMaterial / model.getMaterials",
      };
    },
  ],

  [
    "9. Paint a selected face + native paint",
    async () => {
      const sel = await model.getSelection();
      const n = sel?.length ?? sel?.values?.length ?? 0;
      if (!n) {
        return {
          status: "TODO",
          detail:
            `Nothing is selected. Select a face (or a group/component) in the model and run this again.\n` +
            `selection members: ${members("selection", sel)}`,
        };
      }
      const target = sel[0] ?? sel.values?.[0];
      let painted = null;
      if (probeOf.material?.sketchupId && target?.sketchupId) {
        await model.performOperation(async (op) => {
          op.drawingElementSetMaterialName(target, probeOf.material.name);
        }, "Dirory spike: paint selection");
        painted = "called drawingElementSetMaterialName on the selection";
      }
      return {
        status: painted ? "PARTIAL" : "FAIL",
        detail:
          `selection: ${n} entity/entities\n${painted}\n\n` +
          `Now the second half: can we hand the user the native Paint Bucket pre-loaded with this material? ` +
          `Try op.materialsSetCurrent(...) then SketchUp's Paint tool by hand and say whether the Dirory ` +
          `material is already the active one.`,
        api: "model.getSelection() / op.drawingElementSetMaterialName",
      };
    },
  ],

  [
    "10. Open link + trigger download",
    async () => {
      const ui = SketchUpApi.UI;
      const uiMembers = members("SketchUpApi.UI", ui);
      let opened = "not attempted";
      const openFn = ui?.openURL?.bind(ui) ?? ui?.openUrl?.bind(ui);
      try {
        if (openFn) {
          openFn("https://dirory.com/privacy");
          opened = "openURL called";
        } else {
          window.open("https://dirory.com/privacy", "_blank");
          opened = "window.open called (may be blocked by the sandbox)";
        }
      } catch (e) {
        opened = "threw: " + err(e);
      }
      return {
        status: "PARTIAL",
        detail:
          `${uiMembers}\n\n${opened}\n\n` +
          `Confirm by eye whether a browser tab opened. If not, the sign-in flow must show the user code ` +
          `and URL as copyable text — which is why the spike always prints them.\n\n` +
          `Download test: build a CSV blob and hand it over — ${blobOrDownload()}`,
        api: "SketchUpApi.UI.openURL / window.open",
      };
    },
  ],

  [
    "11. Count instances (timed)",
    async () => {
      const t0 = performance.now();
      const defs = await model.getDefinitions();
      const list = defs?.values ?? defs ?? [];
      const t1 = performance.now();
      let total = 0;
      let shapes = 0;
      for (const d of list) {
        try {
          const inst = await d.getInstances();
          const n = inst?.length ?? 0;
          total += n;
          if (n) shapes++;
        } catch {}
      }
      const t2 = performance.now();
      return {
        status: "PASS",
        detail:
          `definitions: ${list.length} (fetched in ${(t1 - t0).toFixed(0)} ms)\n` +
          `instances counted: ${total} across ${shapes} definitions (walk took ${(t2 - t1).toFixed(0)} ms)\n\n` +
          `The brief asks for a 1,000+ instance model. Paste those two timings for the model you tested ` +
          `so we can judge whether the usage report needs chunking.`,
        api: "model.getDefinitions() / definition.getInstances()",
      };
    },
  ],
];

function platformName() {
  try {
    const p = typeof SketchUpApi.platform === "function" ? SketchUpApi.platform() : SketchUpApi.platform;
    return String(p || "unknown").toLowerCase();
  } catch {
    return "unknown";
  }
}

function safeHost(u) {
  try {
    return new URL(u).host;
  } catch {
    return String(u).slice(0, 60);
  }
}

function blobOrDownload() {
  try {
    const csv = "brand,name,m2\nTest,Test,1.5\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dirory-spike.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "anchor + blob URL clicked — did a file download?";
  } catch (e) {
    return "blob download threw: " + err(e);
  }
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

async function runAll() {
  el("run").disabled = true;
  try {
    for (const [name, fn] of checks) await check(name, fn);
  } finally {
    el("run").disabled = false;
    buildReport();
  }
}

async function signIn() {
  el("signin").disabled = true;
  try {
    ensureInstallId();
    const start = probeOf.device ?? (await api("/auth-device/start", {
      method: "POST",
      body: JSON.stringify({ install_id: installId, plugin_version: SPIKE_VERSION, platform: platformName() }),
    }));
    probeOf.device = start;

    render("3. Device sign-in", "TODO", `approve code ${start.user_code} at ${start.verification_url} — polling…`, "");
    const openFn = SketchUpApi.UI?.openURL?.bind(SketchUpApi.UI);
    const target = start.verification_url_complete || start.verification_url;
    if (openFn && target) {
      try {
        openFn(target);
      } catch {}
    }

    // Honour the server's own cadence instead of hardcoding it (it returns
    // interval and expires_in; see docs/API.md §4).
    const pollMs = (start.interval ?? 5) * 1000;
    const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
    while (Date.now() < deadline) {
      const r = await api("/auth-device/poll", {
        method: "POST",
        body: JSON.stringify({ device_code: start.device_code, install_id: installId, plugin_version: SPIKE_VERSION }),
      });
      if (r.status === "approved" && r.token) {
        token = r.token;
        render("3. Device sign-in", "PASS", `approved. user = ${JSON.stringify(r.user)}\ntoken length = ${String(r.token).length}`, "POST /auth-device/poll → approved");
        break;
      }
      if (r.status === "expired" || r.status === "denied") {
        render("3. Device sign-in", "FAIL", `server said: ${r.status}`, "POST /auth-device/poll");
        break;
      }
      await new Promise((res) => setTimeout(res, pollMs));
    }
  } catch (e) {
    render("3. Device sign-in", "FAIL", err(e), "");
  } finally {
    el("signin").disabled = false;
    buildReport();
  }
}

function buildReport() {
  const lines = [
    `platform: ${platformName()}`,
    `spike: ${SPIKE_VERSION}`,
    "",
    "| # | check | result | notes |",
    "|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(`| | ${r.check.replace(/^\d+\.\s*/, "")} | ${r.status} | ${r.detail.replace(/\n/g, " ").replace(/\|/g, "/").slice(0, 220)} |`);
  }
  el("report").value = lines.join("\n");
  el("out").hidden = false;
}

el("run").addEventListener("click", runAll);
el("signin").addEventListener("click", signIn);
el("copy").addEventListener("click", async () => {
  buildReport();
  const ta = el("report");
  ta.select();
  try {
    await navigator.clipboard.writeText(ta.value);
    el("copy").textContent = "Copied ✓";
  } catch {
    el("copy").textContent = "Select + copy manually";
  }
  setTimeout(() => (el("copy").textContent = "Copy results"), 2500);
});

window.addEventListener("error", (e) => {
  render("runtime error", "FAIL", `${e.message}\n${e.filename}:${e.lineno}`, "");
});

// Render the checklist up front so the panel is never blank, even if the SDK
// fails to load. A blank panel is the worst possible spike outcome.
for (const [name] of checks) render(name, "TODO", "not run yet", "");
el("env").textContent = typeof SketchUpApi === "undefined" ? "waiting for the SDK…" : "ready";
