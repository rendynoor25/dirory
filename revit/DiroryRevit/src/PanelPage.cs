// The dockable pane: a WPF page holding a WebView2 that loads the shared
// Dirory panel from the add-in's own ui folder.

using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.UI;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Dirory.Revit
{
    public class PanelPage : Page, IDockablePaneProvider
    {
        private readonly WebView2 _web = new WebView2();
        public Bridge Bridge { get; }

        // Defines `window.sketchup` for the shared panel: every call becomes a
        // message to the add-in. The panel never knows which host it is in,
        // except through DIRORY_HOST for wording.
        private const string BridgeScript = @"
window.DIRORY_HOST = 'revit';
window.sketchup = new Proxy({}, {
  get: function (_, name) {
    return function (payload) {
      window.chrome.webview.postMessage(JSON.stringify({ name: String(name), payload: payload === undefined ? null : payload }));
    };
  }
});";

        public PanelPage()
        {
            Bridge = new Bridge(this);
            Content = _web;
            Loaded += async (s, e) =>
            {
                if (_web.CoreWebView2 != null) return;
                try
                {
                    // Revit's install folder is read-only; WebView2 needs a writable profile.
                    string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dirory", "WebView2");
                    var env = await CoreWebView2Environment.CreateAsync(null, profile);
                    await _web.EnsureCoreWebView2Async(env);
                    _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "dirory.panel", Path.Combine(App.AddinFolder, "ui"), CoreWebView2HostResourceAccessKind.Allow);
                    await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);
                    _web.CoreWebView2.WebMessageReceived += (o, args) => Bridge.Handle(args.TryGetWebMessageAsString());
                    _web.CoreWebView2.Navigate("https://dirory.panel/panel.html");
                }
                catch (Exception ex)
                {
                    Content = new TextBlock
                    {
                        Text = "Dirory needs the Microsoft Edge WebView2 Runtime.\n\n" + ex.Message,
                        TextWrapping = TextWrapping.Wrap,
                        Margin = new Thickness(12),
                    };
                }
            };
        }

        /// <summary>Call window.&lt;fn&gt;(json) in the panel, from any thread.</summary>
        public void Call(string fn, string json)
        {
            Dispatcher.BeginInvoke(new Action(async () =>
            {
                if (_web.CoreWebView2 == null) return;
                try
                {
                    await _web.CoreWebView2.ExecuteScriptAsync($"window.{fn} && window.{fn}({json ?? "null"});");
                }
                catch { /* the panel may be reloading */ }
            }));
        }

        public void Script(string js)
        {
            Dispatcher.BeginInvoke(new Action(async () =>
            {
                if (_web.CoreWebView2 == null) return;
                try { await _web.CoreWebView2.ExecuteScriptAsync(js); } catch { }
            }));
        }

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            data.FrameworkElement = this;
            data.InitialState = new DockablePaneState { DockPosition = DockPosition.Right };
        }
    }
}
