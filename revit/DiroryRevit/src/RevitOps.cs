// Revit API work, run through one ExternalEvent so it always executes in an
// API context: create Dirory materials, paint faces, load and place families,
// and measure the model.

using System;
using System.Collections.Concurrent;
using System.Drawing;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Visual;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;

namespace Dirory.Revit
{
    public class RevitOps : IExternalEventHandler
    {
        private readonly ConcurrentQueue<Action<UIApplication>> _queue = new ConcurrentQueue<Action<UIApplication>>();
        private readonly ExternalEvent _event;

        public RevitOps() { _event = ExternalEvent.Create(this); }

        public void Run(Action<UIApplication> action)
        {
            _queue.Enqueue(action);
            _event.Raise();
        }

        public void Execute(UIApplication app)
        {
            while (_queue.TryDequeue(out var action))
            {
                try { action(app); }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { /* Esc while picking */ }
                catch (Exception e) { App.Panel.Bridge.Toast("Dirory: " + e.Message); }
            }
        }

        public string GetName() => "Dirory";

        // ------------------------------------------------------------------
        // Materials
        //
        // A Revit material is not an image. Dirory builds one per catalogue
        // material: the texture as a render appearance at its real size (the
        // catalogue's tile size), the texture's average colour as the shaded
        // colour, and the tile grid as the surface pattern, so drawings show
        // the real joints of a 60 x 120 tile.
        // ------------------------------------------------------------------

        public static ElementId EnsureMaterial(Document doc, Autodesk.Revit.ApplicationServices.Application app, string name, string texturePath, double tileWcm, double tileHcm)
        {
            string matName = ("Dirory - " + name).Replace("{", "(").Replace("}", ")").Replace("[", "(").Replace("]", ")");
            var existing = new FilteredElementCollector(doc).OfClass(typeof(Material)).Cast<Material>()
                .FirstOrDefault(m => m.Name == matName);

            if (existing != null)
            {
                // A material made by an earlier build may have no texture
                // (0.1.0-0.1.2 could leave the Image empty): repair it in place.
                if (!HasTexture(doc, existing)) AttachAppearance(doc, app, existing, texturePath, tileWcm, tileHcm);
                return existing.Id;
            }

            using (var t = new Transaction(doc, "Dirory: create material"))
            {
                t.Start();
                ElementId id = Material.Create(doc, matName);
                var mat = (Material)doc.GetElement(id);
                var avg = AverageColor(texturePath);
                mat.Color = avg;
                mat.UseRenderAppearanceForShading = false;

                if (tileWcm > 0 && tileHcm > 0)
                {
                    string patName = $"Dirory tile {tileWcm:0.#}x{tileHcm:0.#} cm";
                    var pat = FillPatternElement.GetFillPatternElementByName(doc, FillPatternTarget.Model, patName);
                    if (pat == null)
                    {
                        double w = UnitUtils.ConvertToInternalUnits(tileWcm, UnitTypeId.Centimeters);
                        double h = UnitUtils.ConvertToInternalUnits(tileHcm, UnitTypeId.Centimeters);
                        pat = FillPatternElement.Create(doc, new FillPattern(patName, FillPatternTarget.Model,
                            FillPatternHostOrientation.ToHost, 0.0, w, h));
                    }
                    mat.SurfaceForegroundPatternId = pat.Id;
                    mat.SurfaceForegroundPatternColor = new Autodesk.Revit.DB.Color(120, 120, 120);
                }

                t.Commit();
                AttachAppearance(doc, app, mat, texturePath, tileWcm, tileHcm);
                return id;
            }
        }

        /// Give the material its own Generic appearance with the Dirory texture
        /// in the Image slot, at the tile's real size. Says so if it cannot.
        private static void AttachAppearance(Document doc, Autodesk.Revit.ApplicationServices.Application app, Material mat,
            string texturePath, double tileWcm, double tileHcm)
        {
            string problem;
            try
            {
                using (var t = new Transaction(doc, "Dirory: material appearance"))
                {
                    t.Start();
                    var appearance = CreateAppearance(doc, app, mat.Name);
                    if (appearance == null)
                    {
                        t.RollBack();
                        problem = "no Generic appearance was found in the project or the material library";
                    }
                    else
                    {
                        mat.AppearanceAssetId = appearance.Id;
                        t.Commit();
                        problem = SetTexture(doc, appearance.Id, texturePath,
                            tileWcm > 0 ? tileWcm : 100, tileHcm > 0 ? tileHcm : 100, mat.Color);
                    }
                }
            }
            catch (Exception e) { problem = e.Message; }

            Log($"material \"{mat.Name}\" texture \"{texturePath}\": {problem ?? "ok"}");
            if (problem != null)
                App.Panel.Bridge.Toast($"Dirory created \"{mat.Name}\" but could not attach its texture ({problem}). " +
                                       "The colour and tile pattern are set. Details: %LOCALAPPDATA%\\Dirory\\revit.log");
        }

        /// True when the material's appearance has an image in its Image slot.
        private static bool HasTexture(Document doc, Material mat)
        {
            try
            {
                var element = doc.GetElement(mat.AppearanceAssetId) as AppearanceAssetElement;
                var diffuse = element?.GetRenderingAsset()?.FindByName(Generic.GenericDiffuse);
                var bitmap = diffuse != null && diffuse.NumberOfConnectedProperties > 0 ? diffuse.GetSingleConnectedAsset() : null;
                var file = bitmap?.FindByName(UnifiedBitmap.UnifiedbitmapBitmap) as AssetPropertyString;
                return file != null && !string.IsNullOrEmpty(file.Value);
            }
            catch { return false; }
        }

        // A Generic appearance to copy: a project asset of the Generic schema
        // (not just any asset with a diffuse slot), else the library's Generic.
        private static AppearanceAssetElement CreateAppearance(Document doc, Autodesk.Revit.ApplicationServices.Application app, string name)
        {
            string unique = name;
            for (int i = 2; AppearanceAssetElement.GetAppearanceAssetElementByName(doc, unique) != null; i++) unique = $"{name} ({i})";

            bool IsGeneric(Asset a)
            {
                try
                {
                    if (a == null || a.FindByName(Generic.GenericDiffuse) == null) return false;
                    var schema = a.FindByName("BaseSchema") as AssetPropertyString;
                    return schema == null || schema.Value == "GenericSchema";
                }
                catch { return false; }
            }

            var generic = new FilteredElementCollector(doc).OfClass(typeof(AppearanceAssetElement))
                .Cast<AppearanceAssetElement>()
                .FirstOrDefault(a => { try { return IsGeneric(a.GetRenderingAsset()); } catch { return false; } });
            if (generic != null) return generic.Duplicate(unique);
            var lib = app.GetAssets(AssetType.Appearance).Where(IsGeneric).ToList();
            var pick = lib.FirstOrDefault(a => a.Name == "Generic") ?? lib.FirstOrDefault();
            return pick == null ? null : AppearanceAssetElement.Create(doc, unique, pick);
        }

        /// Put the texture in the appearance's Image slot. Returns null when done,
        /// else what went wrong.
        private static string SetTexture(Document doc, ElementId appearanceId, string path, double wcm, double hcm, Autodesk.Revit.DB.Color shade)
        {
            if (!System.IO.File.Exists(path)) return "the downloaded texture file is missing";
            string problem = null;
            using (var t = new Transaction(doc, "Dirory: material texture"))
            {
                t.Start();
                using (var scope = new AppearanceAssetEditScope(doc))
                {
                    Asset asset = scope.Start(appearanceId);
                    var diffuse = asset.FindByName(Generic.GenericDiffuse) as AssetPropertyDoubleArray4d;
                    if (diffuse == null)
                    {
                        problem = "the appearance has no Generic colour slot";
                    }
                    else
                    {
                        // The colour shows where the image does not (and in its preview).
                        try { diffuse.SetValueAsColor(shade); } catch { /* keep the template's colour */ }

                        // The slot may hold something other than an image (a
                        // procedural texture in the copied asset): replace it.
                        Asset bitmap = diffuse.NumberOfConnectedProperties > 0 ? diffuse.GetSingleConnectedAsset() : null;
                        if (bitmap != null && !(bitmap.FindByName(UnifiedBitmap.UnifiedbitmapBitmap) is AssetPropertyString))
                        {
                            diffuse.RemoveConnectedAsset();
                            bitmap = null;
                        }
                        if (bitmap == null)
                        {
                            diffuse.AddConnectedAsset("UnifiedBitmapSchema");
                            bitmap = diffuse.GetSingleConnectedAsset();
                        }
                        var file = bitmap?.FindByName(UnifiedBitmap.UnifiedbitmapBitmap) as AssetPropertyString;
                        if (file == null) problem = "Revit did not create an image slot";
                        else if (!file.IsValidValue(path)) problem = "Revit refused the image path";
                        else
                        {
                            file.Value = path;
                            SetDistance(bitmap, UnifiedBitmap.TextureRealWorldScaleX, wcm);
                            SetDistance(bitmap, UnifiedBitmap.TextureRealWorldScaleY, hcm);
                            if (asset.FindByName(Generic.GenericDiffuseImageFade) is AssetPropertyDouble fade && fade.IsValidValue(1.0))
                                fade.Value = 1.0;
                        }
                    }
                    if (problem == null) scope.Commit(true);
                    else scope.Cancel();
                }
                if (problem == null) t.Commit();
                else t.RollBack();
            }
            return problem;
        }

        public static void Log(string line)
        {
            try
            {
                string dir = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dirory");
                System.IO.Directory.CreateDirectory(dir);
                System.IO.File.AppendAllText(System.IO.Path.Combine(dir, "revit.log"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}\r\n");
            }
            catch { /* logging must never break the add-in */ }
        }

        private static void SetDistance(Asset asset, string name, double cm)
        {
            if (asset.FindByName(name) is AssetPropertyDistance d)
            {
                double v = UnitUtils.Convert(cm, UnitTypeId.Centimeters, d.GetUnitTypeId());
                if (d.IsValidValue(v)) d.Value = v;
            }
        }

        private static Autodesk.Revit.DB.Color AverageColor(string path)
        {
            try
            {
                using (var img = new Bitmap(path))
                using (var small = new Bitmap(img, new Size(8, 8)))
                {
                    long r = 0, g = 0, b = 0;
                    for (int x = 0; x < 8; x++)
                        for (int y = 0; y < 8; y++)
                        {
                            var c = small.GetPixel(x, y);
                            r += c.R; g += c.G; b += c.B;
                        }
                    return new Autodesk.Revit.DB.Color((byte)(r / 64), (byte)(g / 64), (byte)(b / 64));
                }
            }
            catch { return new Autodesk.Revit.DB.Color(200, 200, 200); }
        }

        /// <summary>Paint faces one by one until Esc, like SketchUp's Paint Bucket.</summary>
        public static int PaintLoop(UIDocument uidoc, ElementId materialId, string label)
        {
            Document doc = uidoc.Document;
            int painted = 0;
            while (true)
            {
                Reference r;
                try
                {
                    r = uidoc.Selection.PickObject(ObjectType.Face, $"Dirory: click a face to paint {label}. Esc to finish.");
                }
                catch (Autodesk.Revit.Exceptions.OperationCanceledException) { break; }
                Element e = doc.GetElement(r);
                if (!(e?.GetGeometryObjectFromReference(r) is Face face)) continue;
                using (var t = new Transaction(doc, "Dirory: paint"))
                {
                    t.Start();
                    try
                    {
                        doc.Paint(e.Id, face, materialId);
                        t.Commit();
                        painted++;
                    }
                    catch
                    {
                        t.RollBack();
                        TaskDialog.Show("Dirory", "This face cannot be painted. Try a wall, floor, ceiling or roof face.");
                    }
                }
            }
            return painted;
        }

        // ------------------------------------------------------------------
        // Families (.rfa)
        // ------------------------------------------------------------------

        public static void LoadAndPlace(UIDocument uidoc, string rfaPath)
        {
            Document doc = uidoc.Document;
            Family family;
            using (var t = new Transaction(doc, "Dirory: load family"))
            {
                t.Start();
                if (!doc.LoadFamily(rfaPath, out family))
                {
                    // Already loaded: find it by name.
                    string name = System.IO.Path.GetFileNameWithoutExtension(rfaPath);
                    family = new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>()
                        .FirstOrDefault(f => f.Name == name);
                }
                if (family == null)
                {
                    t.RollBack();
                    throw new Exception("Revit could not load this family.");
                }
                var symbol = (FamilySymbol)doc.GetElement(family.GetFamilySymbolIds().First());
                if (!symbol.IsActive) symbol.Activate();
                t.Commit();
                uidoc.PromptForFamilyInstancePlacement(symbol);
            }
        }
    }
}
