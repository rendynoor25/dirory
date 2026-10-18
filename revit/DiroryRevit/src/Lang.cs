// Dirory for Revit in English or Bahasa Indonesia.
//
// The panel's translations live in ui/i18n.json, shared with the SketchUp
// plugin (i18n.rb), so both speak the same Indonesian. Dictionary() is what the
// panel gets (window.diroryI18n); T() translates the add-in's own messages,
// which are written in English and looked up as "phrase.<English>".
//
// The choice is kept in %APPDATA%\Dirory\revit.json ("language"); until the
// architect picks one, it follows Windows' display language.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace Dirory.Revit
{
    public static class Lang
    {
        public static readonly Dictionary<string, string> Supported = new Dictionary<string, string>
        {
            ["en"] = "English",
            ["id"] = "Bahasa Indonesia",
        };

        public static string Current { get; private set; } = "en";

        private static Dictionary<string, object> _strings;   // "strings" in i18n.json, per language

        /// At start-up: the saved choice, else Windows' display language.
        public static void Init()
        {
            string saved = "";
            try
            {
                string settings = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Dirory", "revit.json");
                if (File.Exists(settings)) saved = Json.Str(Json.Read(File.ReadAllText(settings)), "language");
            }
            catch { /* defaults below */ }
            Current = Normalize(saved != "" ? saved : CultureInfo.CurrentUICulture.Name);
        }

        public static void Set(string code) => Current = Normalize(code);

        /// "id", "id-ID", "in-ID" -> "id"; anything else -> "en".
        public static string Normalize(string code)
        {
            string c = (code ?? "").Trim().ToLowerInvariant();
            return c.StartsWith("id") || c.StartsWith("in") ? "id" : "en";
        }

        private static Dictionary<string, object> Strings(string lang)
        {
            if (_strings == null)
            {
                try
                {
                    var root = Json.Read(File.ReadAllText(Path.Combine(App.AddinFolder, "ui", "i18n.json")));
                    _strings = root.TryGetValue("strings", out var s) ? s as Dictionary<string, object> : null;
                }
                catch { _strings = null; }
                if (_strings == null) _strings = new Dictionary<string, object>();
            }
            return _strings.TryGetValue(lang, out var d) && d is Dictionary<string, object> dict
                ? dict : new Dictionary<string, object>();
        }

        /// The panel's dictionary for the current language, English keys filled in.
        public static Dictionary<string, object> Dictionary()
        {
            var all = new Dictionary<string, object>(Strings("en"));
            if (Current != "en")
                foreach (var kv in Strings(Current)) all[kv.Key] = kv.Value;
            return all;
        }

        /// An English message in the current language. `pairs`: name, value, ...
        /// filling {name} slots.
        public static string T(string en, params object[] pairs)
        {
            string text = en;
            if (Current != "en" && Strings(Current).TryGetValue("phrase." + en, out var v) && v is string s && s != "") text = s;
            for (int i = 0; i + 1 < pairs.Length; i += 2)
                text = text.Replace("{" + pairs[i] + "}", Convert.ToString(pairs[i + 1], CultureInfo.InvariantCulture));
            return text;
        }
    }
}
