// The dockable Rhino panel: an Eto panel holding a WPF WebView2 that loads the
// shared Dirory panel from the plug-in's own ui folder (as the Revit add-in
// does), through the virtual host https://dirory.panel/.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DiroryRhino
{
    [Guid("7A0C2E5D-1F3B-4E8A-B6C9-2D4F6A8B0C13")]
    public class PanelHost : Eto.Forms.Panel
    {
        /// The one bridge every open panel shares (sign-in state, pending work).
        public static readonly Bridge Bridge = new Bridge();
        private static readonly List<PanelHost> Open = new List<PanelHost>();

        private readonly WebView2 _web = new WebView2();

        // Defines `window.sketchup` for the shared panel: every call becomes a
        // message to the plug-in. DIRORY_HOST tells the panel which app it is in.
        private const string BridgeScript = @"
window.DIRORY_HOST = 'rhino';
window.sketchup = new Proxy({}, {
  get: function (_, name) {
    return function (payload) {
      window.chrome.webview.postMessage(JSON.stringify({ name: String(name), payload: payload === undefined ? null : payload }));
    };
  }
});";

        public PanelHost()
        {
            lock (Open) Open.Add(this);
            Content = Eto.Forms.WpfHelpers.ToEto(_web);
            _web.Loaded += async (s, e) =>
            {
                if (_web.CoreWebView2 != null) return;
                try
                {
                    // The install folder may be read-only; WebView2 needs a writable profile.
                    string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dirory", "WebView2-Rhino");
                    var env = await CoreWebView2Environment.CreateAsync(null, profile);
                    await _web.EnsureCoreWebView2Async(env);
                    _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "dirory.panel", Path.Combine(App.AddinFolder, "ui"), CoreWebView2HostResourceAccessKind.Allow);
                    await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);
                    _web.CoreWebView2.WebMessageReceived += (o, args) => Bridge.Handle(args.TryGetWebMessageAsString());
                    // Links the panel opens go to the browser, never inside Rhino.
                    _web.CoreWebView2.NewWindowRequested += (o, args) => { args.Handled = true; Cloud.Open(args.Uri); };
                    _web.CoreWebView2.Navigate("https://dirory.panel/panel.html");
                }
                catch (Exception ex)
                {
                    Content = new Eto.Forms.Label
                    {
                        Text = "Dirory needs the Microsoft Edge WebView2 Runtime.\n\n" + ex.Message,
                        Wrap = Eto.Forms.WrapMode.Word,
                    };
                }
            };
        }

        protected override void Dispose(bool disposing)
        {
            lock (Open) Open.Remove(this);
            base.Dispose(disposing);
        }

        /// <summary>Call window.&lt;fn&gt;(json) in every open panel, from any thread.</summary>
        public static void Call(string fn, string json) => Script($"window.{fn} && window.{fn}({json ?? "null"});");

        public static void Script(string js)
        {
            PanelHost[] panels;
            lock (Open) panels = Open.ToArray();
            foreach (var p in panels)
            {
                var web = p._web;
                web.Dispatcher.BeginInvoke(new Action(async () =>
                {
                    if (web.CoreWebView2 == null) return;
                    try { await web.CoreWebView2.ExecuteScriptAsync(js); }
                    catch { /* the panel may be reloading or closed */ }
                }));
            }
        }
    }
}
