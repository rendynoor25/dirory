// The panel's `sketchup.*` calls, answered for Rhino. Names and payloads are
// exactly those of plugin/dirory_library/main.rb (and the Revit add-in's
// Bridge.cs), so panel.js is shared.
//
// Not in Rhino yet: measured quantities, the RAB, search-miss reporting
// and quotes. The plug-in therefore sends no usage data and needs no consent
// switches; it only downloads what the architect clicks.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Rhino;
using Rhino.Commands;

namespace DiroryRhino
{
    public class Bridge
    {
        private readonly Cloud _cloud = new Cloud();
        private Dictionary<string, object> _pending;   // device sign-in in progress
        private string _pollInfo = "";
        private readonly Favourites _favourites;

        public Bridge()
        {
            _favourites = new Favourites(_cloud, json => PanelHost.Call("diroryFavourites", json));
        }

        public void Toast(string text) => PanelHost.Call("diroryToast", Json.Write(new { text, ms = 7000 }));

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
                    if (name == "ready") PushI18n();
                    break;
                case "signIn": _ = SignInStart(); break;
                case "openSignInPage": Cloud.Open(Json.Str(_pending, "verification_url_complete") is var u && u != "" ? u : Json.Str(_pending, "verification_url")); break;
                case "cancelSignIn": _pending = null; PushAccount(); break;
                case "signOut": _ = SignOut(); break;
                case "setName": _ = SetName(Json.Str(data, "name")); break;
                case "setLanguage":
                    Lang.Set(Json.Str(data, "language"));
                    _cloud.Set("language", Lang.Current);
                    PushI18n();
                    break;
                case "checkForUpdate":
                case "downloadUpdate":
                    Toast(Lang.T("You have Dirory for Rhino {version}. Newer versions are on dirory.com/download.", "version", App.Version));
                    break;
                case "applyMaterial": _ = ApplyMaterial(data); break;
                case "insertModel": _ = InsertModel(data); break;
                case "requestReport":
                    // The Quantifier's usage list (Report.cs), measured on Rhino's UI thread.
                    RhinoApp.InvokeOnUiThread(new Action(() =>
                    {
                        var doc = RhinoDoc.ActiveDoc;
                        PanelHost.Call("diroryReport", Json.Write(doc == null
                            ? new Dictionary<string, object> { ["models"] = new object[0], ["materials"] = new object[0] }
                            : Report.Build(doc)));
                    }));
                    break;
                case "openURL": Cloud.Open(Json.Str(data, "url")); break;
                case "openPrivacy": Cloud.Open("https://dirory.com/privacy"); break;
                case "toggleFavourite": _favourites.Toggle(rawString); break;
                case "ping":
                case "searchMiss":
                case "setShareUsage": case "setShareProject": case "setShareSearchMiss": case "consentSave":
                    break; // nothing to do in Rhino yet; no usage data is sent
                default:
                    Toast(Lang.T("This is not available in Dirory for Rhino yet ({name}).", "name", name));
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

        private void PushAccount(string error = null) => PanelHost.Call("diroryAccount", Json.Write(AccountState(error)));

        /// Sign out: revoke the token on the server first (so a copy of it stops
        /// working too), then forget it here even if the server is unreachable.
        private async Task SignOut()
        {
            await _favourites.Sync();   // send stars not saved yet while the token still works
            try { if (_cloud.SignedIn) await _cloud.Send(HttpMethod.Post, "/auth-device/revoke", new { }); }
            catch (Exception) { /* offline: the token still expires after 90 idle days */ }
            _cloud.Set("token", ""); _cloud.Set("name", ""); _cloud.Set("email", "");
            _favourites.Forget();
            PushAccount();
            PanelHost.Call("diroryFavourites", Json.Write(new { favourites = new string[0], recent = new string[0] }));
        }

        /// Rename the signed-in architect (profiles.full_name; the web app shows
        /// the same name). Answers the panel with diroryNameSaved.
        private async Task SetName(string name)
        {
            void Say(object r) => PanelHost.Call("diroryNameSaved", Json.Write(r));
            name = Regex.Replace(name ?? "", @"\s+", " ").Trim();
            if (name.Length < 1 || name.Length > 80 || Regex.IsMatch(name, @"[\u0000-\u001f\u007f<>]"))
            {
                Say(new { ok = false, error = Lang.T("Enter a name of 1 to 80 characters.") });
                return;
            }
            if (!_cloud.SignedIn) { Say(new { ok = false, error = Lang.T("Sign in first.") }); return; }
            try
            {
                var (code, body) = await _cloud.Send(HttpMethod.Post, "/auth-device/profile", new { name });
                if (code == 200)
                {
                    string saved = Json.Str(Json.Read(body), "name");
                    if (saved == "") saved = name;
                    _cloud.Set("name", saved);
                    PushAccount();
                    Say(new { ok = true, name = saved });
                }
                else if (code == 401)
                {
                    _cloud.Set("token", "");
                    PushAccount();
                    Say(new { ok = false, error = Lang.T("Your session has expired. Please sign in again.") });
                }
                else
                {
                    string err = Json.Str(Json.Read(body), "error");
                    Say(new { ok = false, error = Lang.T("Could not save the name ({error}).", "error", err == "" ? "HTTP " + code : err) });
                }
            }
            catch (Exception e) { Say(new { ok = false, error = Lang.T("Could not reach Dirory: {error}", "error", e.Message) }); }
        }

        /// The panel's language: translations, the language choice, and the
        /// plug-in's name and version for Settings.
        private void PushI18n()
        {
            PanelHost.Call("diroryI18n", Json.Write(new
            {
                strings = Lang.Dictionary(),
                languages = Lang.Supported,
                language = Lang.Current,
                version = App.Version,
            }));
            PanelHost.Call("diroryHostInfo", Json.Write(new { host = "rhino", version = App.Version }));
        }

        private async Task SignInStart()
        {
            var (code, body) = await _cloud.Send(HttpMethod.Post, "/auth-device/start",
                new { install_id = _cloud.Get("install_id"), plugin_version = "rhino-" + App.Version, platform = "win" }, withToken: false);
            var d = Json.Read(body);
            if (code < 200 || code >= 300 || Json.Str(d, "device_code") == "")
            {
                PushAccount(Lang.T("Could not start sign-in (HTTP {code}). Please try again.", "code", code));
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
                    PushAccount(Lang.T("Sign-in was not completed. Please try again."));
                    return;
                }
            }
        }

        // ------------------------------------------------------------ catalogue

        private async Task LoadCatalog()
        {
            int code; string body;
            try { (code, body) = await _cloud.Send(HttpMethod.Get, "/catalog"); }
            catch (Exception e) { PanelHost.Call("diroryError", Json.Write(Lang.T("Could not reach Dirory: {error}", "error", e.Message))); return; }
            if (code == 401 && _cloud.SignedIn)
            {
                _cloud.Set("token", "");
                (code, body) = await _cloud.Send(HttpMethod.Get, "/catalog");
            }
            if (code < 200 || code >= 300)
            {
                PanelHost.Call("diroryError", Json.Write(Lang.T("Could not load the Dirory catalogue (HTTP {code}).", "code", code)));
                return;
            }
            var data = Json.Read(body);
            var items = (data.TryGetValue("items", out var it) ? it as System.Collections.ArrayList : null) ?? new System.Collections.ArrayList();
            // Rhino imports the SketchUp file itself: models need a .skp, materials an image.
            var usable = items.Cast<Dictionary<string, object>>().Where(i =>
                Json.Str(i, "type") == "material"
                    ? Json.Str(i, "material_path") != ""
                    : Json.Str(i, "model_path").EndsWith(".skp", StringComparison.OrdinalIgnoreCase)).ToList();
            // Thumbnails load through the plug-in (Thumbs.cs), not from the signed URLs.
            foreach (var i in usable)
            {
                string id = Json.Str(i, "asset_id"), url = Json.Str(i, "thumbnail_url");
                if (id != "" && (url != "" || Json.Str(i, "thumbnail") != ""))
                    i["thumbnail_url"] = Thumbs.Remember(id, Json.Str(i, "thumbnail"), url);
            }
            PanelHost.Call("diroryRender", Json.Write(new Dictionary<string, object>
            {
                ["items"] = usable,
                ["brand_logos"] = data.TryGetValue("brand_logos", out var bl) ? bl : new Dictionary<string, object>(),
                ["path"] = "Dirory cloud · Rhino",
                ["account"] = AccountState(),
                ["favourites"] = _favourites.Stars,
                ["recent"] = _favourites.Recent,
            }));
            // Stars from the account (and from SketchUp or Revit) arrive a moment later.
            _ = _favourites.Sync();
        }

        // -------------------------------------------------- place and paint

        /// Run one of Dirory's Rhino commands for `item`, once no other command
        /// is running (Rhino runs one command at a time).
        private void RunCommand(string command, Commands.Pending item)
        {
            if (Command.InCommand())
            {
                Toast(Lang.T("Finish or cancel the current Rhino command (Esc), then click the card again."));
                return;
            }
            if (RhinoDoc.ActiveDoc == null) { Toast(Lang.T("Open a Rhino model first.")); return; }
            Commands.Next = item;
            RhinoApp.SetFocusToMainWindow();
            RhinoApp.RunScript("_" + command, false);
        }

        private static Commands.Pending ItemFrom(Dictionary<string, object> d, string path)
        {
            double w = 0, h = 0;
            if (d.TryGetValue("tile_size_cm", out var ts) && ts is System.Collections.ArrayList size && size.Count >= 2)
            {
                var inv = System.Globalization.CultureInfo.InvariantCulture;
                double.TryParse(Convert.ToString(size[0], inv), System.Globalization.NumberStyles.Any, inv, out w);
                double.TryParse(Convert.ToString(size[1], inv), System.Globalization.NumberStyles.Any, inv, out h);
            }
            return new Commands.Pending
            {
                Path = path,
                AssetId = Json.Str(d, "asset_id"),
                Version = Json.Str(d, "version") == "" ? "1" : Json.Str(d, "version"),
                Name = Json.Str(d, "name"),
                Brand = Json.Str(d, "brand"),
                Category = Json.Str(d, "category"),
                Sku = Json.Str(d, "sku"),
                ProductUrl = Json.Str(d, "product_url"),
                Dimensions = Json.Str(d, "dimensions"),
                TileWidthCm = w,
                TileHeightCm = h,
                Appearance = d.TryGetValue("appearance", out var look) ? look as Dictionary<string, object> : null,
            };
        }

        private async Task<string> DownloadFor(Dictionary<string, object> d, string what)
        {
            if (!_cloud.SignedIn) { PanelHost.Call("diroryNeedSignIn", Json.Write(new { action = what == "material" ? "material" : "load" })); return null; }
            string assetId = Json.Str(d, "asset_id");
            if (assetId == "") { Toast(Lang.T("This item is not available from the cloud.")); return null; }
            Toast(Lang.T("Downloading {name}…", "name", Json.Str(d, "name")));
            string badge = Json.Write(new { asset_id = assetId });
            PanelHost.Call("diroryDownloading", badge);
            try
            {
                string path = await _cloud.Download(assetId, Json.Str(d, "version"));
                PanelHost.Call("diroryDownloaded", badge);
                return path;
            }
            catch (UnauthorizedAccessException e) { PanelHost.Call("diroryDownloadFailed", badge); _cloud.Set("token", ""); PushAccount(); Toast(e.Message); }
            catch (Exception e) { PanelHost.Call("diroryDownloadFailed", badge); Toast(Lang.T("Could not download {name}: {error}", "name", Json.Str(d, "name"), "error", e.Message)); }
            return null;
        }

        private async Task InsertModel(Dictionary<string, object> d)
        {
            string path = await DownloadFor(d, "model");
            if (path == null) return;
            if (!path.EndsWith(".skp", StringComparison.OrdinalIgnoreCase))
            {
                Toast(Lang.T("This product has no SketchUp model Rhino can import."));
                return;
            }
            RhinoApp.InvokeOnUiThread(new Action(() => RunCommand("DiroryPlace", ItemFrom(d, path))));
        }

        private async Task ApplyMaterial(Dictionary<string, object> d)
        {
            string path = await DownloadFor(d, "material");
            if (path == null) return;
            RhinoApp.InvokeOnUiThread(new Action(() => RunCommand("DiroryPaint", ItemFrom(d, path))));
        }
    }
}
