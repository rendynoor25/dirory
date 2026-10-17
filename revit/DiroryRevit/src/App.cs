// Dirory for Revit — application entry point.
//
// The same idea as the SketchUp plugin, and the same panel: the add-in hosts
// plugin/dirory_library/ui (panel.html, panel.js, rab.js) in a WebView2
// dockable pane. A small bridge turns the panel's `sketchup.*` calls into
// messages for this add-in (Bridge.cs), so the catalogue, search, colour
// families, quantities and the RAB are one code base for both hosts.
//
// Revit API work (materials, families, painting, quantities) must run in an
// API context, so it is queued through one ExternalEvent (RevitOps.cs).

using System;
using System.IO;
using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace Dirory.Revit
{
    public class App : IExternalApplication
    {
        public const string Version = "0.1.7";
        public static readonly DockablePaneId PaneId = new DockablePaneId(new Guid("6E3B2D3A-6A0E-4C55-9C8E-2B1F7A5D9E41"));

        public static PanelPage Panel { get; private set; }
        public static RevitOps Ops { get; private set; }
        public static string AddinFolder => Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                Ops = new RevitOps();
                Panel = new PanelPage();
                application.RegisterDockablePane(PaneId, "Dirory", Panel);

                // Live cost: any change to a model, or switching to another
                // one, marks the takeoff out of date (Bridge re-measures).
                application.ControlledApplication.DocumentChanged += (s, e) => Panel.Bridge.MarkChanged();
                application.ViewActivated += (s, e) =>
                {
                    if (e.PreviousActiveView?.Document != e.CurrentActiveView?.Document) Panel.Bridge.MarkChanged();
                };

                const string tab = "Dirory";
                try { application.CreateRibbonTab(tab); } catch (Autodesk.Revit.Exceptions.ArgumentException) { /* exists */ }
                RibbonPanel panel = application.CreateRibbonPanel(tab, "Dirory");
                var button = new PushButtonData(
                    "DiroryShowLibrary", "Dirory\nLibrary",
                    Assembly.GetExecutingAssembly().Location, typeof(ShowPaneCommand).FullName)
                {
                    ToolTip = "Open the Dirory panel: Indonesian building products, materials and the RAB cost estimate.",
                    LargeImage = Icon("dirory32.png"),
                    Image = Icon("dirory16.png"),
                };
                panel.AddItem(button);
                var update = new PushButtonData(
                    "DiroryCheckUpdate", "Check for\nUpdates",
                    Assembly.GetExecutingAssembly().Location, typeof(CheckUpdateCommand).FullName)
                {
                    ToolTip = $"Dirory for Revit {Version}. Checks dirory.com for a newer version.",
                    LargeImage = Icon("update32.png"),
                    Image = Icon("update16.png"),
                };
                panel.AddItem(update);

                // A quiet check at start-up; the panel mentions a newer version when it opens.
                _ = RevitUpdate.CheckAsync(quiet: true);
                return Result.Succeeded;
            }
            catch (Exception e)
            {
                TaskDialog.Show("Dirory", "Dirory could not start:\n" + e.Message);
                return Result.Failed;
            }
        }

        public Result OnShutdown(UIControlledApplication application) => Result.Succeeded;

        /// A ribbon image shipped next to the DLL; null if it is missing.
        private static BitmapImage Icon(string file)
        {
            string path = Path.Combine(AddinFolder, file);
            if (!File.Exists(path)) return null;
            var image = new BitmapImage();
            image.BeginInit();
            image.UriSource = new Uri(path);
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.EndInit();
            return image;
        }
    }

    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class CheckUpdateCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, Autodesk.Revit.DB.ElementSet elements)
        {
            RevitUpdate.ShowDialog();
            return Result.Succeeded;
        }
    }

    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class ShowPaneCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, Autodesk.Revit.DB.ElementSet elements)
        {
            commandData.Application.GetDockablePane(App.PaneId).Show();
            return Result.Succeeded;
        }
    }
}
