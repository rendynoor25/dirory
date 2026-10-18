// Updates for the Revit add-in. Revit cannot replace an add-in while it runs,
// so this checks dirory.com for a newer version and points to the download;
// the installer does the rest once Revit is closed.
//
//   GET https://dirory.com/api/plugin/latest -> { revit_version, revit_download_url, ... }

using System;
using System.Net.Http;
using System.Threading.Tasks;
using Autodesk.Revit.UI;

namespace Dirory.Revit
{
    public static class RevitUpdate
    {
        private const string LatestUrl = "https://dirory.com/api/plugin/latest";
        private const string DownloadPage = "https://dirory.com/download";
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        public static string Latest { get; private set; } = "";
        public static bool Checked { get; private set; }
        public static bool NewerAvailable => Checked && IsNewer(Latest, App.Version);

        /// Ask dirory.com for the latest version. `quiet`: no message on failure.
        public static async Task CheckAsync(bool quiet)
        {
            try
            {
                string body = await Http.GetStringAsync(LatestUrl).ConfigureAwait(false);
                Latest = Json.Str(Json.Read(body), "revit_version");
                Checked = Latest != "";
            }
            catch (Exception)
            {
                if (!quiet) Checked = false;
            }
        }

        /// The ribbon button: check now and say what to do.
        public static void ShowDialog()
        {
            try { CheckAsync(quiet: false).Wait(TimeSpan.FromSeconds(10)); } catch { /* reported below */ }
            var dlg = new TaskDialog("Dirory for Revit") { MainInstruction = $"Dirory for Revit {App.Version}" };
            if (!Checked)
            {
                dlg.MainContent = Lang.T("Could not reach dirory.com to check for updates. Check your internet connection and try again.");
                dlg.CommonButtons = TaskDialogCommonButtons.Close;
                dlg.Show();
                return;
            }
            if (!NewerAvailable)
            {
                dlg.MainContent = Lang.T("You have the latest version ({version}).", "version", App.Version);
                dlg.CommonButtons = TaskDialogCommonButtons.Close;
                dlg.Show();
                return;
            }
            dlg.MainInstruction = Lang.T("Dirory for Revit {version} is available", "version", Latest);
            dlg.MainContent = Lang.T("You have {current}. To update: download it, close Revit, extract the .zip and run Install-Dirory.cmd. Your sign-in and settings are kept.", "current", App.Version);
            dlg.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, Lang.T("Open the download page"), Lang.T("dirory.com/download (choose Revit)"));
            dlg.CommonButtons = TaskDialogCommonButtons.Close;
            if (dlg.Show() == TaskDialogResult.CommandLink1) Cloud.Open(DownloadPage);
        }

        /// "0.1.10" > "0.1.9": compare the numbers, not the text.
        public static bool IsNewer(string latest, string current)
        {
            int[] Parse(string v)
            {
                var parts = (v ?? "").Split('.');
                var n = new int[3];
                for (int i = 0; i < 3 && i < parts.Length; i++) int.TryParse(parts[i], out n[i]);
                return n;
            }
            var a = Parse(latest);
            var b = Parse(current);
            for (int i = 0; i < 3; i++) if (a[i] != b[i]) return a[i] > b[i];
            return false;
        }
    }
}
