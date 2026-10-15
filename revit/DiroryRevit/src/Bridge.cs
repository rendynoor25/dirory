// The panel's `sketchup.*` calls, answered for Revit. Names and payloads are
// exactly those of plugin/dirory_library/main.rb, so panel.js is shared.
//
// Not in the Revit add-in yet: usage reports, search-miss reporting and
// quotes. The add-in therefore sends no usage data and needs no consent
// switches; it only downloads what the architect clicks.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.UI;

namespace Dirory.Revit
{
    public class Bridge
    {
        private readonly PanelPage _page;
        private readonly Cloud _cloud = new Cloud();
        private Dictionary<string, object> _pending;   // device sign-in in progress
        private string _pollInfo = "";
        private Dictionary<string, object> _lastTakeoff;

        public Bridge(PanelPage page) { _page = page; }

        public void Toast(string text) => _page.Call("diroryToast", Json.Write(new { text, ms = 7000 }));

        public void Handle(string message)
        {
            var msg = Json.Read(message);
            string name = Json.Str(msg, "name");
            object raw = msg.TryGetValue("payload", out var p) ? p : null;
            var payload = raw is string s ? Json.Read(s) : (raw as Dictionary<string, object> ?? new Dictionary<string, object>());
            try { Dispatch(name, payload, raw as string); }
            catch (Exception e) { Toast("Dirory: " + e.Message); }
        }

        private void Dispatch(string name, Dictionary<string, object> data, string rawString)
        {
            switch (name)
            {
                case "ready":
                case "rescan":
                    _ = LoadCatalog();
                    _page.Script("var h=document.getElementById('hint'); if(h) h.textContent='Click a material card, then click faces in the model to paint it (Esc to finish). Models load as Revit families where a .rfa is available.';");
                    break;
                case "signIn": _ = SignInStart(); break;
                case "openSignInPage": Cloud.Open(Json.Str(_pending, "verification_url_complete") is var u && u != "" ? u : Json.Str(_pending, "verification_url")); break;
                case "cancelSignIn": _pending = null; PushAccount(); break;
                case "signOut":
                    _cloud.Set("token", ""); _cloud.Set("name", ""); _cloud.Set("email", "");
                    PushAccount();
                    break;
                case "applyMaterial": _ = ApplyMaterial(data); break;
                case "insertModel": _ = InsertModel(data); break;
                case "requestTakeoff":
                    App.Ops.Run(app =>
                    {
                        var doc = app.ActiveUIDocument?.Document;
                        if (doc == null) { Toast("Open a Revit project first."); return; }
                        _lastTakeoff = Takeoff.Run(doc);
                        _page.Call("diroryTakeoff", Json.Write(_lastTakeoff));
                    });
                    break;
                case "exportTakeoff": ExportTakeoff(); break;
                case "loadPrices": _page.Call("diroryPrices", Json.Write(CleanPrices(Json.Read(_cloud.Get("custom_prices"))))); break;
                case "savePrices": _cloud.Set("custom_prices", Json.Write(CleanPrices(data))); break;
                case "requestRab": _ = RequestRab(Json.Str(data, "region")); break;
                case "requestReport":
                    _page.Call("diroryReport", Json.Write(new { models = new object[0], materials = new object[0] }));
                    break;
                case "printHtml": OpenHtml(Json.Str(data, "name"), Json.Str(data, "html")); break;
                case "saveText": SaveText(Json.Str(data, "title"), Json.Str(data, "filename"), Json.Str(data, "content")); break;
                case "openURL": Cloud.Open(Json.Str(data, "url")); break;
                case "openPrivacy": Cloud.Open("https://dirory.com/privacy"); break;
                case "toggleFavourite": case "searchMiss": case "setLanguage":
                case "setShareUsage": case "setShareProject": case "setShareSearchMiss": case "consentSave":
                case "checkForUpdate":
                    break; // nothing to do in Revit yet; no usage data is sent
                default:
                    Toast("Not available in the Revit add-in yet.");
                    break;
            }
        }

        // -------------------------------------------------------------- account

        private object AccountState(string error = null) => new
        {
            signedIn = _cloud.SignedIn,
            cloudConfigured = true,
            name = _cloud.Get("name"),
            email = _cloud.Get("email"),
            phone = "", firm = "",
            shareUsage = false, shareProject = false, shareSearchMiss = false,
            consentNeeded = false,
            devicePending = _pending != null,
            deviceStatus = _pollInfo,
            deviceUserCode = Json.Str(_pending, "user_code"),
            error,
        };

        private void PushAccount(string error = null) => _page.Call("diroryAccount", Json.Write(AccountState(error)));

        private async Task SignInStart()
        {
            var (code, body) = await _cloud.Send(HttpMethod.Post, "/auth-device/start",
                new { install_id = _cloud.Get("install_id"), plugin_version = "revit-" + App.Version, platform = "win" }, withToken: false);
            var d = Json.Read(body);
            if (code < 200 || code >= 300 || Json.Str(d, "device_code") == "")
            {
                PushAccount($"Could not start sign-in (HTTP {code}). Please try again.");
                return;
            }
            _pending = d;
            Cloud.Open(Json.Str(d, "verification_url_complete") is var u && u != "" ? u : Json.Str(d, "verification_url"));
            PushAccount();
            int interval = int.TryParse(Json.Str(d, "interval"), out var i) ? Math.Max(3, i) : 5;
            while (_pending == d)
            {
                await Task.Delay(interval * 1000);
                if (_pending != d) break;
                var (pc, pb) = await _cloud.Send(HttpMethod.Post, "/auth-device/poll",
                    new { device_code = Json.Str(d, "device_code"), install_id = _cloud.Get("install_id") }, withToken: false);
                var r = Json.Read(pb);
                string status = Json.Str(r, "status");
                _pollInfo = $"HTTP {pc} {status}".Trim();
                if (status == "approved")
                {
                    _cloud.Set("token", Json.Str(r, "token"));
                    var user = r.TryGetValue("user", out var uo) ? uo as Dictionary<string, object> : null;
                    _cloud.Set("name", Json.Str(user, "name"));
                    _cloud.Set("email", Json.Str(user, "email"));
                    _pending = null;
                    PushAccount();
                    _ = LoadCatalog();
                    return;
                }
                if (status == "expired" || status == "denied")
                {
                    _pending = null;
                    PushAccount("Sign-in was not completed. Please try again.");
                    return;
                }
            }
        }

        // ------------------------------------------------------------ catalogue

        private async Task LoadCatalog()
        {
            var (code, body) = await _cloud.Send(HttpMethod.Get, "/catalog");
            if (code == 401 && _cloud.SignedIn)
            {
                _cloud.Set("token", "");
                (code, body) = await _cloud.Send(HttpMethod.Get, "/catalog");
            }
            if (code < 200 || code >= 300)
            {
                _page.Call("diroryError", Json.Write($"Could not load the Dirory catalogue (HTTP {code})."));
                return;
            }
            var data = Json.Read(body);
            var items = (data.TryGetValue("items", out var it) ? it as System.Collections.ArrayList : null) ?? new System.Collections.ArrayList();
            // Materials work in Revit; models only where the product has a Revit family.
            var usable = items.Cast<Dictionary<string, object>>().Where(i =>
                Json.Str(i, "type") == "material" ||
                Json.Str(i, "model_path").EndsWith(".rfa", StringComparison.OrdinalIgnoreCase) ||
                Json.Str(i, "rfa_path") != "").ToList();
            _page.Call("diroryRender", Json.Write(new Dictionary<string, object>
            {
                ["items"] = usable,
                ["brand_logos"] = data.TryGetValue("brand_logos", out var bl) ? bl : new Dictionary<string, object>(),
                ["path"] = "Dirory cloud · Revit",
                ["account"] = AccountState(),
                ["favourites"] = new string[0],
                ["recent"] = new string[0],
            }));
            int models = usable.Count(i => Json.Str(i, "type") != "material");
            if (models == 0) Toast("Materials are ready. Revit families (.rfa) for Dirory products are coming soon.");
        }

        private async Task ApplyMaterial(Dictionary<string, object> d)
        {
            if (!_cloud.SignedIn) { _page.Call("diroryNeedSignIn", Json.Write(new { action = "material" })); return; }
            string assetId = Json.Str(d, "asset_id");
            if (assetId == "") { Toast("This material is not available from the cloud."); return; }
            Toast("Downloading " + Json.Str(d, "name") + "…");
            string path;
            try { path = await _cloud.Download(assetId, Json.Str(d, "version")); }
            catch (UnauthorizedAccessException e) { _cloud.Set("token", ""); PushAccount(); Toast(e.Message); return; }
            double w = 0, h = 0;
            if (d.TryGetValue("tile_size_cm", out var ts) && ts is System.Collections.ArrayList size && size.Count >= 2)
            {
                double.TryParse(Convert.ToString(size[0], System.Globalization.CultureInfo.InvariantCulture), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out w);
                double.TryParse(Convert.ToString(size[1], System.Globalization.CultureInfo.InvariantCulture), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out h);
            }
            string label = (Json.Str(d, "brand") + " " + Json.Str(d, "name")).Trim();
            App.Ops.Run(app =>
            {
                var uidoc = app.ActiveUIDocument;
                if (uidoc == null) { Toast("Open a Revit project first."); return; }
                var id = RevitOps.EnsureMaterial(uidoc.Document, app.Application, label, path, w, h);
                int n = RevitOps.PaintLoop(uidoc, id, label);
                if (n > 0) Toast($"Painted {n} face(s) with {label}.");
            });
        }

        private async Task InsertModel(Dictionary<string, object> d)
        {
            string modelPath = Json.Str(d, "path");
            if (!modelPath.EndsWith(".rfa", StringComparison.OrdinalIgnoreCase))
            {
                Toast("This product has no Revit family (.rfa) yet.");
                return;
            }
            if (!_cloud.SignedIn) { _page.Call("diroryNeedSignIn", Json.Write(new { action = "load" })); return; }
            string path = await _cloud.Download(Json.Str(d, "asset_id"), Json.Str(d, "version"));
            App.Ops.Run(app =>
            {
                var uidoc = app.ActiveUIDocument;
                if (uidoc == null) { Toast("Open a Revit project first."); return; }
                RevitOps.LoadAndPlace(uidoc, path);
            });
        }

        // ------------------------------------------------------------ RAB

        private async Task RequestRab(string region)
        {
            if (!_cloud.SignedIn) { _page.Call("diroryRabError", Json.Write("Sign in to estimate costs.")); return; }
            // A project pass binds to one project: only a hash of its id is sent.
            var tcs = new TaskCompletionSource<string>();
            App.Ops.Run(app =>
            {
                var doc = app.ActiveUIDocument?.Document;
                tcs.TrySetResult(doc == null ? "" : Cloud.Sha256(doc.ProjectInformation?.UniqueId ?? doc.Title));
            });
            string model = await tcs.Task;
            region = string.IsNullOrEmpty(region) ? "jakarta" : region;
            var (code, body) = await _cloud.Send(HttpMethod.Get, $"/rab?region={Uri.EscapeDataString(region)}&model={model}");
            if (code == 200) _page.Call("diroryRabBook", body);
            else if (code == 402) _page.Call("diroryRabUpgrade", Json.Write(Json.Str(Json.Read(body), "upgrade_url")));
            else if (code == 401) { _cloud.Set("token", ""); PushAccount(); _page.Call("diroryRabError", Json.Write("Your session has expired. Please sign in again.")); }
            else _page.Call("diroryRabError", Json.Write($"Could not load the {region} price book (HTTP {code})."));
        }

        // ------------------------------------------------------------ files

        // The architect's own unit prices, by RAB line id: numbers only, at most 2,000.
        private static Dictionary<string, double> CleanPrices(Dictionary<string, object> raw)
        {
            var clean = new Dictionary<string, double>();
            foreach (var kv in raw)
            {
                if (clean.Count >= 2000) break;
                if (kv.Key.Length > 300) continue;
                if (double.TryParse(Convert.ToString(kv.Value, System.Globalization.CultureInfo.InvariantCulture),
                        System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double v)
                    && v >= 0 && v < 1e13)
                    clean[kv.Key] = v;
            }
            return clean;
        }

        private void ExportTakeoff()
        {
            if (_lastTakeoff == null) { Toast("Measure the model first."); return; }
            var sb = new StringBuilder("Element,Material,Unit,Quantity\r\n");
            foreach (Dictionary<string, object> r in (IEnumerable<object>)_lastTakeoff["rows"])
                sb.Append($"{r["element"]},\"{Json.Str(r, "material").Replace("\"", "\"\"")}\",m2,{Json.Str(r, "area_m2")}\r\n");
            foreach (Dictionary<string, object> o in (IEnumerable<object>)_lastTakeoff["openings"])
                sb.Append($"Opening ({o["kind"]}),\"{Json.Str(o, "name").Replace("\"", "\"\"")}\",unit,{Json.Str(o, "count")}\r\n");
            foreach (Dictionary<string, object> s in (IEnumerable<object>)_lastTakeoff["structure"])
            {
                string name = $"\"{Json.Str(s, "name").Replace("\"", "\"\"")}\"";
                foreach (var (field, unit) in new[] { ("concrete_m3", "m3 concrete"), ("formwork_m2", "m2 formwork"), ("rebar_kg", "kg rebar (modelled)"), ("steel_kg", "kg steel") })
                    if ((double)s[field] > 0) sb.Append($"Structure ({s["member"]}),{name},{unit},{Json.Str(s, field)}\r\n");
            }
            foreach (Dictionary<string, object> m in (IEnumerable<object>)_lastTakeoff["mep"])
            {
                string size = Json.Str(m, "size_mm");
                string label = string.Join(" ", new[] { Json.Str(m, "name"), Json.Str(m, "system"), Json.Str(m, "material"),
                    size != "" && size != "0" ? "DN " + size : "" }.Where(x => x != ""));
                sb.Append($"MEP ({m["group"]}),\"{label.Replace("\"", "\"\"")}\",{m["unit"]},{Json.Str(m, "quantity")}\r\n");
            }
            SaveText("Export Dirory quantities", "Dirory_quantities.csv", sb.ToString());
        }

        private static void OpenHtml(string name, string html)
        {
            string safe = new string((name ?? "Dirory").Where(char.IsLetterOrDigit).ToArray());
            string path = Path.Combine(Path.GetTempPath(), $"{(safe == "" ? "Dirory" : safe)}_{DateTime.Now:yyyyMMdd_HHmmss}.html");
            File.WriteAllText(path, html ?? "", new UTF8Encoding(false));
            Cloud.Open(path);
        }

        private void SaveText(string title, string filename, string content)
        {
            _page.Dispatcher.BeginInvoke(new Action(() =>
            {
                using (var dlg = new System.Windows.Forms.SaveFileDialog { Title = title, FileName = filename })
                {
                    string ext = Path.GetExtension(filename);
                    if (ext != "") dlg.Filter = $"{ext.TrimStart('.').ToUpper()} files|*{ext}|All files|*.*";
                    if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                    File.WriteAllText(dlg.FileName, content ?? "", new UTF8Encoding(true));
                    Toast("Saved to " + dlg.FileName);
                }
            }));
        }
    }
}
