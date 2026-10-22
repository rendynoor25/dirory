// Minimal JSON reader/writer shared by the Revit 2024 (.NET Framework 4.8), Revit 2025+ (.NET 8) and Rhino 8 builds; copied from revit/DiroryRevit.
// Replaces System.Web's JavaScriptSerializer,
// which .NET 8 doesn't have, and keeps its shapes: objects read as
// Dictionary<string, object>, arrays as ArrayList, numbers as int, long,
// decimal or double (the first that fits), and anonymous objects write by
// their public properties.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace DiroryRhino
{
    public static class Json
    {
        public static string Write(object value)
        {
            var sb = new StringBuilder();
            WriteValue(sb, value, 0);
            return sb.ToString();
        }

        public static Dictionary<string, object> Read(string json)
        {
            try { return new Parser(json ?? "").ParseRoot() as Dictionary<string, object> ?? new Dictionary<string, object>(); }
            catch { return new Dictionary<string, object>(); }
        }

        public static string Str(Dictionary<string, object> d, string key) =>
            d != null && d.TryGetValue(key, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) : "";

        private static void WriteValue(StringBuilder sb, object v, int depth)
        {
            if (depth > 256) throw new InvalidOperationException("JSON nesting too deep.");
            switch (v)
            {
                case null: sb.Append("null"); return;
                case string s: WriteString(sb, s); return;
                case char c: WriteString(sb, c.ToString()); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case double d: sb.Append(double.IsNaN(d) || double.IsInfinity(d) ? "null" : d.ToString("R", CultureInfo.InvariantCulture)); return;
                case float f: sb.Append(float.IsNaN(f) || float.IsInfinity(f) ? "null" : f.ToString("R", CultureInfo.InvariantCulture)); return;
                case Enum e: sb.Append(Convert.ToInt64(e, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture)); return;
                case IFormattable n when v is int || v is long || v is short || v is byte || v is sbyte ||
                                         v is uint || v is ulong || v is ushort || v is decimal:
                    sb.Append(n.ToString(null, CultureInfo.InvariantCulture)); return;
                case IDictionary dict:
                    sb.Append('{');
                    bool firstKey = true;
                    foreach (DictionaryEntry kv in dict)
                    {
                        if (!firstKey) sb.Append(',');
                        firstKey = false;
                        WriteString(sb, Convert.ToString(kv.Key, CultureInfo.InvariantCulture));
                        sb.Append(':');
                        WriteValue(sb, kv.Value, depth + 1);
                    }
                    sb.Append('}');
                    return;
                case IEnumerable list:
                    sb.Append('[');
                    bool firstItem = true;
                    foreach (var item in list)
                    {
                        if (!firstItem) sb.Append(',');
                        firstItem = false;
                        WriteValue(sb, item, depth + 1);
                    }
                    sb.Append(']');
                    return;
            }
            // Anonymous and plain objects: public properties and fields.
            sb.Append('{');
            bool first = true;
            var type = v.GetType();
            foreach (var p in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!p.CanRead || p.GetIndexParameters().Length > 0) continue;
                if (!first) sb.Append(',');
                first = false;
                WriteString(sb, p.Name);
                sb.Append(':');
                WriteValue(sb, p.GetValue(v, null), depth + 1);
            }
            foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!first) sb.Append(',');
                first = false;
                WriteString(sb, f.Name);
                sb.Append(':');
                WriteValue(sb, f.GetValue(v), depth + 1);
            }
            sb.Append('}');
        }

        // Escapes < > & ' like JavaScriptSerializer did, so the output stays safe
        // to splice into ExecuteScriptAsync and HTML.
        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ' || c == '<' || c == '>' || c == '&' || c == '\'' || c == (char)0x2028 || c == (char)0x2029)
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        private sealed class Parser
        {
            private readonly string _s;
            private int _i;
            public Parser(string s) { _s = s; }

            public object ParseRoot()
            {
                var v = Value(0);
                Ws();
                if (_i != _s.Length) throw Error();
                return v;
            }

            private Exception Error() => new FormatException("Invalid JSON at " + _i);

            private void Ws()
            {
                while (_i < _s.Length && char.IsWhiteSpace(_s[_i])) _i++;
            }

            private object Value(int depth)
            {
                if (depth > 256) throw Error();
                Ws();
                if (_i >= _s.Length) throw Error();
                char c = _s[_i];
                if (c == '{') return Obj(depth);
                if (c == '[') return Arr(depth);
                if (c == '"') return Str();
                if (Lit("true")) return true;
                if (Lit("false")) return false;
                if (Lit("null")) return null;
                return Num();
            }

            private bool Lit(string word)
            {
                if (string.CompareOrdinal(_s, _i, word, 0, word.Length) != 0) return false;
                _i += word.Length;
                return true;
            }

            private Dictionary<string, object> Obj(int depth)
            {
                var d = new Dictionary<string, object>();
                _i++;
                Ws();
                if (_i < _s.Length && _s[_i] == '}') { _i++; return d; }
                while (true)
                {
                    Ws();
                    if (_i >= _s.Length || _s[_i] != '"') throw Error();
                    string key = Str();
                    Ws();
                    if (_i >= _s.Length || _s[_i] != ':') throw Error();
                    _i++;
                    d[key] = Value(depth + 1);
                    Ws();
                    if (_i >= _s.Length) throw Error();
                    if (_s[_i] == ',') { _i++; continue; }
                    if (_s[_i] == '}') { _i++; return d; }
                    throw Error();
                }
            }

            private ArrayList Arr(int depth)
            {
                var a = new ArrayList();
                _i++;
                Ws();
                if (_i < _s.Length && _s[_i] == ']') { _i++; return a; }
                while (true)
                {
                    a.Add(Value(depth + 1));
                    Ws();
                    if (_i >= _s.Length) throw Error();
                    if (_s[_i] == ',') { _i++; continue; }
                    if (_s[_i] == ']') { _i++; return a; }
                    throw Error();
                }
            }

            private string Str()
            {
                _i++;
                var sb = new StringBuilder();
                while (true)
                {
                    if (_i >= _s.Length) throw Error();
                    char c = _s[_i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (_i >= _s.Length) throw Error();
                    char e = _s[_i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (_i + 4 > _s.Length) throw Error();
                            sb.Append((char)int.Parse(_s.Substring(_i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            _i += 4;
                            break;
                        default: throw Error();
                    }
                }
            }

            private object Num()
            {
                int start = _i;
                while (_i < _s.Length && "+-0123456789.eE".IndexOf(_s[_i]) >= 0) _i++;
                string t = _s.Substring(start, _i - start);
                if (t.Length == 0) throw Error();
                var inv = CultureInfo.InvariantCulture;
                if (int.TryParse(t, NumberStyles.Integer, inv, out var i)) return i;
                if (long.TryParse(t, NumberStyles.Integer, inv, out var l)) return l;
                if (decimal.TryParse(t, NumberStyles.Float, inv, out var m)) return m;
                if (double.TryParse(t, NumberStyles.Float, inv, out var d)) return d;
                throw Error();
            }
        }
    }
}
