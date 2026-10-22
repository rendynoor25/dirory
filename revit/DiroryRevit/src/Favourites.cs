// Starred products that follow the architect's account, as in SketchUp
// (plugin/dirory_library/cloud.rb sync_favourites_pull / push_favourites):
// GET /favourites -> { favourites, recent }, POST the full lists back
// (replace semantics). Keys are asset ids, as the panel's item.key.
//
// The add-in keeps no "recent" list of its own; it sends the server's back
// unchanged so SketchUp's recently used items survive a star made here.
// A star made offline or signed out waits in `favourites_pending` and is
// applied on top of the account's list at the next sync, so it neither gets
// lost nor overwrites stars made on another computer.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Dirory.Revit
{
    public class Favourites
    {
        private readonly Cloud _cloud;
        private readonly Action<string> _push;   // window.diroryFavourites
        private readonly SemaphoreSlim _sync = new SemaphoreSlim(1, 1);

        public Favourites(Cloud cloud, Action<string> push)
        {
            _cloud = cloud;
            _push = push;
        }

        public List<string> Stars => Keys("favourites");
        public List<string> Recent => Keys("recent");

        /// The panel's star: applied here at once, then sent to the account.
        public void Toggle(string key)
        {
            key = (key ?? "").Trim();
            if (key == "") return;
            var stars = Stars;
            bool on = !stars.Contains(key);
            if (on) stars.Insert(0, key); else stars.Remove(key);
            _cloud.Set("favourites", Json.Write(stars));
            var pending = Pending();
            pending[key] = on;
            _cloud.Set("favourites_pending", Json.Write(pending));
            _ = Sync();
        }

        /// Signing out: the stars belong to the account, not this computer.
        public void Forget()
        {
            _cloud.Set("favourites", "[]");
            _cloud.Set("recent", "[]");
            _cloud.Set("favourites_pending", "{}");
        }

        /// Read the account's lists, apply stars not sent yet, and send the
        /// result back if anything was waiting. Quiet when offline or signed out.
        public async Task Sync()
        {
            if (!_cloud.SignedIn) return;
            await _sync.WaitAsync();
            try
            {
                var (code, body) = await _cloud.Send(HttpMethod.Get, "/favourites");
                if (code != 200) return;
                var data = Json.Read(body);
                var stars = List(data, "favourites");
                var recent = List(data, "recent");

                var sent = Pending();
                foreach (var kv in sent)
                {
                    stars.Remove(kv.Key);
                    if (kv.Value) stars.Insert(0, kv.Key);
                }
                if (sent.Count > 0)
                {
                    (code, _) = await _cloud.Send(HttpMethod.Post, "/favourites", new Dictionary<string, object>
                    {
                        ["favourites"] = stars,
                        ["recent"] = recent,
                    });
                    if (code == 200)
                    {
                        // Keep only toggles made while this request was out.
                        var now = Pending();
                        foreach (var kv in sent)
                            if (now.TryGetValue(kv.Key, out bool v) && v == kv.Value) now.Remove(kv.Key);
                        _cloud.Set("favourites_pending", Json.Write(now));
                    }
                }

                // Toggles made while syncing stay visible until the next sync.
                foreach (var kv in Pending())
                {
                    stars.Remove(kv.Key);
                    if (kv.Value) stars.Insert(0, kv.Key);
                }
                bool changed = !stars.SequenceEqual(Stars) || !recent.SequenceEqual(Recent);
                _cloud.Set("favourites", Json.Write(stars));
                _cloud.Set("recent", Json.Write(recent));
                if (changed) _push(Json.Write(new Dictionary<string, object> { ["favourites"] = stars, ["recent"] = recent }));
            }
            catch (Exception) { /* offline: the pending stars wait for the next sync */ }
            finally { _sync.Release(); }
        }

        private List<string> Keys(string setting)
        {
            try { return List(Json.Read("{\"k\":" + (_cloud.Get(setting) is var s && s != "" ? s : "[]") + "}"), "k"); }
            catch (Exception) { return new List<string>(); }
        }

        private Dictionary<string, bool> Pending()
        {
            var pending = new Dictionary<string, bool>();
            try
            {
                string s = _cloud.Get("favourites_pending");
                foreach (var kv in Json.Read(s == "" ? "{}" : s))
                    if (kv.Value is bool b) pending[kv.Key] = b;
            }
            catch (Exception) { }
            return pending;
        }

        private static List<string> List(Dictionary<string, object> d, string key) =>
            (d != null && d.TryGetValue(key, out var v) && v is ArrayList a ? a.OfType<string>() : Enumerable.Empty<string>())
                .Where(k => k.Trim() != "").Distinct().ToList();
    }
}
