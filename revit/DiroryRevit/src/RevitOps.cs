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
            if (existing != null) return existing.Id;

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

                var appearance = CreateAppearance(doc, app, matName);
                if (appearance != null)
                {
                    mat.AppearanceAssetId = appearance.Id;
                    t.Commit();
                    SetTexture(doc, appearance.Id, texturePath, tileWcm > 0 ? tileWcm : 100, tileHcm > 0 ? tileHcm : 100);
                }
                else
                {
                    t.Commit();
                }
                return id;
            }
        }

        private static AppearanceAssetElement CreateAppearance(Document doc, Autodesk.Revit.ApplicationServices.Application app, string name)
        {
            // Prefer a Generic appearance already in the project; else the library.
            var generic = new FilteredElementCollector(doc).OfClass(typeof(AppearanceAssetElement))
                .Cast<AppearanceAssetElement>()
                .FirstOrDefault(a =>
                {
                    try { return a.GetRenderingAsset()?.FindByName(Generic.GenericDiffuse) != null; }
                    catch { return false; }
                });
            try
            {
                if (generic != null) return generic.Duplicate(name);
                var lib = app.GetAssets(AssetType.Appearance)
                    .FirstOrDefault(a => a.FindByName(Generic.GenericDiffuse) != null);
                return lib == null ? null : AppearanceAssetElement.Create(doc, name, lib);
            }
            catch { return null; }
        }

        private static void SetTexture(Document doc, ElementId appearanceId, string path, double wcm, double hcm)
        {
            using (var t = new Transaction(doc, "Dirory: material texture"))
            {
                t.Start();
                using (var scope = new AppearanceAssetEditScope(doc))
                {
                    Asset asset = scope.Start(appearanceId);
                    var diffuse = asset.FindByName(Generic.GenericDiffuse) as AssetPropertyDoubleArray4d;
                    if (diffuse != null)
                    {
                        if (diffuse.NumberOfConnectedProperties == 0) diffuse.AddConnectedAsset("UnifiedBitmapSchema");
                        Asset bitmap = diffuse.GetSingleConnectedAsset();
                        if (bitmap != null)
                        {
                            if (bitmap.FindByName(UnifiedBitmap.UnifiedbitmapBitmap) is AssetPropertyString file && file.IsValidValue(path))
                                file.Value = path;
                            SetDistance(bitmap, UnifiedBitmap.TextureRealWorldScaleX, wcm);
                            SetDistance(bitmap, UnifiedBitmap.TextureRealWorldScaleY, hcm);
                        }
                    }
                    scope.Commit(true);
                }
                t.Commit();
            }
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
