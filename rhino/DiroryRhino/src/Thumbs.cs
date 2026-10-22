// Card thumbnails for the panel, fetched by the plug-in rather than WebView2.
//
// The catalogue's thumbnail_url is a storage URL signed for one hour, one per
// card. Loaded straight into the panel, the ~2,000 cards start ~2,000 requests
// at once and storage drops many of them (net::ERR_CONNECTION_CLOSED), and any
// card drawn after the hour gets HTTP 400; either way the panel shows its
// placeholder icon. So Bridge points every card at https://dirory.thumbs/<asset_id>
// and PanelHost answers those requests from here: 16 downloads at a time,
// retried, then dirory.com's stable /api/thumb/<asset_id> once the signature
// has expired, and kept on disk under the thumbnail's storage key (it names
// the asset version, so a new upload gets a new file).

using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace DiroryRhino
{
    public static class Thumbs
    {
        public const string Host = "dirory.thumbs";
        private const string StableBase = "https://dirory.com/api/thumb/";

        // .NET Framework allows 2 connections per server unless told otherwise.
        private static readonly HttpClient Http = new HttpClient(new HttpClientHandler { MaxConnectionsPerServer = 16 })
            { Timeout = TimeSpan.FromSeconds(30) };
        private static readonly SemaphoreSlim Gate = new SemaphoreSlim(16);
        private static readonly ConcurrentDictionary<string, (string key, string url)> Known =
            new ConcurrentDictionary<string, (string key, string url)>(StringComparer.OrdinalIgnoreCase);
        private static readonly string CacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dirory", "thumbs-rhino");

        /// Remember where `assetId`'s thumbnail is; returns the panel URL for it.
        public static string Remember(string assetId, string storageKey, string signedUrl)
        {
            Known[assetId] = (storageKey ?? "", signedUrl ?? "");
            return "https://" + Host + "/" + Uri.EscapeDataString(assetId);
        }

        /// The image for a https://dirory.thumbs/<asset_id> request, or null.
        public static async Task<(byte[] data, string type)> Get(string requestUri)
        {
            string assetId = Uri.UnescapeDataString(new Uri(requestUri).AbsolutePath.Trim('/'));
            if (assetId == "" || !Known.TryGetValue(assetId, out var where)) return (null, null);

            string file = where.key != "" ? Path.Combine(CacheDir, Hash(where.key) + Path.GetExtension(where.key).ToLowerInvariant()) : null;
            if (file != null && File.Exists(file))
            {
                try { return (File.ReadAllBytes(file), TypeOf(file)); } catch { /* fetch it again */ }
            }

            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                var got = await Fetch(where.url).ConfigureAwait(false);
                if (got.data == null) got = await Fetch(StableBase + Uri.EscapeDataString(assetId)).ConfigureAwait(false);
                if (got.data != null && file != null)
                {
                    try { Directory.CreateDirectory(CacheDir); File.WriteAllBytes(file, got.data); } catch { /* cache is optional */ }
                }
                return got;
            }
            finally { Gate.Release(); }
        }

        // Up to three tries; a 4xx (an expired signature) is not retried.
        private static async Task<(byte[] data, string type)> Fetch(string url)
        {
            if (string.IsNullOrEmpty(url)) return (null, null);
            for (int attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    using (var res = await Http.GetAsync(url).ConfigureAwait(false))
                    {
                        if (res.IsSuccessStatusCode)
                            return (await res.Content.ReadAsByteArrayAsync().ConfigureAwait(false),
                                    res.Content.Headers.ContentType?.MediaType ?? "image/jpeg");
                        if ((int)res.StatusCode < 500) return (null, null);
                    }
                }
                catch { /* dropped connection or timeout: try again */ }
                await Task.Delay(400 * (attempt + 1)).ConfigureAwait(false);
            }
            return (null, null);
        }

        private static string Hash(string s)
        {
            using (var sha = SHA1.Create())
            {
                var sb = new StringBuilder();
                foreach (byte b in sha.ComputeHash(Encoding.UTF8.GetBytes(s))) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private static string TypeOf(string file)
        {
            switch (Path.GetExtension(file).ToLowerInvariant())
            {
                case ".png": return "image/png";
                case ".webp": return "image/webp";
                case ".gif": return "image/gif";
                default: return "image/jpeg";
            }
        }
    }
}
