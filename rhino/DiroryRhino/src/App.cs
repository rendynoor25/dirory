// Dirory for Rhino 8 — plug-in entry point.
//
// The same idea as the SketchUp plugin and the Revit add-in, and the same
// panel: the plug-in hosts plugin/dirory_library/ui (panel.html, panel.js) in a
// WebView2 inside a dockable Rhino panel (PanelHost.cs). The panel's
// `sketchup.*` calls become messages for this plug-in (Bridge.cs), so the
// catalogue, search, filters and sign-in are one code base for every host.
//
// Document work (importing a SketchUp model as a block, creating and assigning
// a material) runs inside Rhino commands (Commands.cs), so it is undoable and
// never collides with another running command.

using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Rhino;
using Rhino.Commands;
using Rhino.PlugIns;
using Rhino.UI;

[assembly: Guid("3C1F6B0E-8E2B-4B7C-9D3A-5E1A7F2C9B64")]
[assembly: AssemblyTitle("Dirory")]
[assembly: AssemblyDescription("Indonesian building products and materials for Rhino: the Dirory library.")]
[assembly: AssemblyCompany("Dirory")]
[assembly: AssemblyProduct("Dirory for Rhino")]
[assembly: AssemblyVersion(DiroryRhino.App.Version + ".0")]
[assembly: AssemblyInformationalVersion(DiroryRhino.App.Version)]
[assembly: PlugInDescription(DescriptionType.Organization, "Dirory")]
[assembly: PlugInDescription(DescriptionType.WebSite, "https://dirory.com")]

namespace DiroryRhino
{
    public class App : PlugIn
    {
        public new const string Version = "0.1.3";

        public static App Instance { get; private set; }
        public static string AddinFolder => Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        public App() { Instance = this; }

        // Loaded with Rhino so the panel is registered before Rhino restores
        // its layout (a docked Dirory panel reopens with the window).
        public override PlugInLoadTime LoadTime => PlugInLoadTime.AtStartup;

        protected override LoadReturnCode OnLoad(ref string errorMessage)
        {
            Lang.Init();
            Icon icon = null;
            try
            {
                string ico = Path.Combine(AddinFolder, "dirory.ico");
                if (File.Exists(ico)) icon = new Icon(ico, 32, 32);
            }
            catch { /* the panel works without its tab icon */ }
            Panels.RegisterPanel(this, typeof(PanelHost), "Dirory", icon);
            return LoadReturnCode.Success;
        }
    }

    /// `Dirory`: open (or bring forward) the Dirory panel.
    public class DiroryCommand : Command
    {
        public override string EnglishName => "Dirory";

        protected override Result RunCommand(RhinoDoc doc, RunMode mode)
        {
            // Opened plainly the first time, Rhino floats a tiny panel: put it
            // in the dock bar that holds Layers instead (OpenPanelAsSibling
            // refuses a panel Rhino has not shown yet).
            var id = typeof(PanelHost).GUID;
            if (!Panels.IsPanelVisible(id))
            {
                Guid bar = Panels.PanelDockBar(PanelIds.Layers);
                if (bar != Guid.Empty) Panels.OpenPanel(bar, id, true);
                if (Panels.IsPanelVisible(id)) return Result.Success;
            }
            Panels.OpenPanel(id);
            return Result.Success;
        }
    }
}
