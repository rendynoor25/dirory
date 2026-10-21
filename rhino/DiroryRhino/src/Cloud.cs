// Dirory cloud client for Rhino (copied from the Revit add-in): the same Edge Functions as the SketchUp
// plugin (catalog, download, auth-device, rab), with the same publishable key.
// Settings live in %APPDATA%\Dirory\rhino.json.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace DiroryRhino
{
    public class Cloud
    {
        public const string ApiBase = "https://ajlmncbzufagplbaaukv.supabase.co/functions/v1";
        public const string ApiKey = "sb_publishable_JIpzGVjnwobUxaGbhBEsHg_0Lfu_QPs";

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        private readonly string _settingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Dirory", "rhino.json");
        private Dictionary<string, object> _settings;

        public Cloud()
        {
            try { _settings = Json.Read(File.ReadAllText(_settingsPath)); } catch { _settings = new Dictionary<string, object>(); }
            if (string.IsNullOrEmpty(Get("install_id"))) Set("install_id", Guid.NewGuid().ToString());
        }

        public string Get(string key) => Json.Str(_settings, key);

        public void Set(string key, string value)
        {
            _settings[key] = value;
            Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath));
            File.WriteAllText(_settingsPath, Json.Write(_settings));
        }

        public bool SignedIn => !string.IsNullOrEmpty(Get("token"));

        private HttpRequestMessage Request(HttpMethod method, string path, bool withToken = true)
        {
            var req = new HttpRequestMessage(method, path.StartsWith("http") ? path : ApiBase + path);
            req.Headers.Add("apikey", ApiKey);
            if (withToken && SignedIn) req.Headers.Add("Authorization", "Bearer " + Get("token"));
            return req;
        }

        public async Task<(int code, string body)> Send(HttpMethod method, string path, object body = null, bool withToken = true)
        {
            var req = Request(method, path, withToken);
            if (body != null) req.Content = new StringContent(Json.Write(body), Encoding.UTF8, "application/json");
            using (var res = await Http.SendAsync(req).ConfigureAwait(false))
                return ((int)res.StatusCode, await res.Content.ReadAsStringAsync().ConfigureAwait(false));
        }

        /// <summary>Download a catalogue asset into the local cache; returns its path.</summary>
        /// `format`: "" for the product's file, "rfa" for its Revit family.
        public async Task<string> Download(string assetId, string version, string format = "")
        {
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Dirory", "cache", assetId, "v" + (string.IsNullOrEmpty(version) ? "1" : version) + (format == "" ? "" : "-" + format));
            if (Directory.Exists(folder))
                foreach (var f in Directory.GetFiles(folder)) return f;

            var (code, text) = await Send(HttpMethod.Get, "/download/" + assetId + (format == "" ? "" : "?format=" + format)).ConfigureAwait(false);
            if (code == 401) throw new UnauthorizedAccessException("Your Dirory session has expired. Please sign in again.");
            if (code < 200 || code >= 300) throw new Exception("Download server answered HTTP " + code);
            var meta = Json.Read(text);
            string url = Json.Str(meta, "url"), name = Path.GetFileName(Json.Str(meta, "file_name"));
            if (url == "" || name == "") throw new Exception("The server did not return a download link.");
            byte[] bytes = await Http.GetByteArrayAsync(url).ConfigureAwait(false);
            Directory.CreateDirectory(folder);
            string path = Path.Combine(folder, name);
            File.WriteAllBytes(path, bytes);
            return path;
        }

        public static string Sha256(string text)
        {
            using (var sha = SHA256.Create())
            {
                var sb = new StringBuilder();
                foreach (byte b in sha.ComputeHash(Encoding.UTF8.GetBytes(text ?? ""))) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// Open a web page in the browser. Only absolute http(s) URLs: a product
        /// link comes from vendor data, and the shell would also run a program
        /// path, a network share or a file:// link (OWASP A05).
        public static void Open(string url)
        {
            if (!IsWebUrl(url)) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        public static bool IsWebUrl(string url) =>
            Uri.TryCreate(url ?? "", UriKind.Absolute, out var u) &&
            (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp) &&
            !string.IsNullOrEmpty(u.Host);
    }
}
