// Dirory's document work, as Rhino commands so it is undoable and runs one at
// a time with everything else. The panel downloads the file, sets Next and
// runs the command (Bridge.RunCommand); typed by hand, a command with nothing
// pending just says to click a card in the panel.
//
//   DiroryPlace  import the product's .skp as a block (once per asset version)
//                and place instances at picked points
//   DiroryPaint  create the material (once per asset version) with its texture
//                at real-world size and assign it to the selected objects
//
// Both are tagged like the SketchUp plugin tags its components and materials
// (dictionary "Dirory"): user strings "Dirory.asset_id", "Dirory.name",
// "Dirory.brand", "Dirory.category", "Dirory.type", "Dirory.version", ...

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Rhino;
using Rhino.Commands;
using Rhino.DocObjects;
using Rhino.Geometry;
using Rhino.Input;
using Rhino.Input.Custom;
using Rhino.Render;

namespace DiroryRhino
{
    public static class Commands
    {
        public const string Prefix = "Dirory.";

        public class Pending
        {
            public string Path, AssetId, Version, Name, Brand, Category, Sku, ProductUrl, Dimensions;
            public double TileWidthCm, TileHeightCm;
            public Dictionary<string, object> Appearance;

            /// "Brand Name", or just the name for Dirory's own samples.
            public string Label
            {
                get
                {
                    string brand = Brand.Equals("Dirory", StringComparison.OrdinalIgnoreCase) ? "" : Brand;
                    return (brand + " " + Name).Trim();
                }
            }

            /// The tags every Dirory block, instance and material carries.
            public IEnumerable<KeyValuePair<string, string>> Tags(string type)
            {
                var tags = new List<KeyValuePair<string, string>>
                {
                    new KeyValuePair<string, string>("asset_id", AssetId),
                    new KeyValuePair<string, string>("name", Name),
                    new KeyValuePair<string, string>("brand", Brand),
                    new KeyValuePair<string, string>("category", Category),
                    new KeyValuePair<string, string>("type", type),
                    new KeyValuePair<string, string>("version", Version),
                };
                if (TileWidthCm > 0) tags.Add(new KeyValuePair<string, string>("tile_size", Cm(TileWidthCm) + " x " + Cm(TileHeightCm) + " cm"));
                if (Sku != "") tags.Add(new KeyValuePair<string, string>("sku", Sku));
                if (ProductUrl != "") tags.Add(new KeyValuePair<string, string>("product_url", ProductUrl));
                if (Dimensions != "") tags.Add(new KeyValuePair<string, string>("dimensions", Dimensions));
                return tags.Where(t => !string.IsNullOrEmpty(t.Value));
            }

            /// The marker in a block's description or a material's notes that
            /// finds it again: one per asset version.
            public string Marker => $"dirory:{AssetId}:v{Version}";
        }

        /// What the panel asked for last; taken (and cleared) by the next command.
        public static Pending Next;

        public static Pending Take()
        {
            var p = Next;
            Next = null;
            return p;
        }

        public static string Cm(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);

        /// Rhino names: no control characters or the few Rhino rejects.
        public static string SafeName(string name)
        {
            string s = Regex.Replace(name ?? "", @"[\u0000-\u001f""\\/:*?<>|{}\[\]]", " ");
            s = Regex.Replace(s, @"\s+", " ").Trim();
            return s == "" ? "Dirory item" : (s.Length > 100 ? s.Substring(0, 100).Trim() : s);
        }

        public static void Toast(string text) => PanelHost.Bridge.Toast(text);
    }

    // -------------------------------------------------------------------- place

    public class DiroryPlaceCommand : Command
    {
        public override string EnglishName => "DiroryPlace";

        protected override Result RunCommand(RhinoDoc doc, RunMode mode)
        {
            var item = Commands.Take();
            if (item == null)
            {
                RhinoApp.WriteLine(Lang.T("Dirory: click a model card in the Dirory panel to place it."));
                return Result.Nothing;
            }
            int index = EnsureBlock(doc, item, out bool created);
            if (index < 0) return Result.Failure;
            var idef = doc.InstanceDefinitions[index];
            Commands.Toast(created
                ? Lang.T("\"{name}\" is a block now. Click in the model to place it, Enter or Esc to finish.", "name", idef.Name)
                : Lang.T("Click in the model to place \"{name}\", Enter or Esc to finish.", "name", idef.Name));

            int placed = 0;
            while (true)
            {
                var gp = new GetPoint();
                gp.SetCommandPrompt(Lang.T("Place {name} (Enter to finish)", "name", idef.Name));
                gp.AcceptNothing(true);
                // Show the block at the cursor while the architect picks a point.
                var preview = idef.GetObjects().Select(o => o.Geometry).Where(g => g != null).ToArray();
                BoundingBox box = BoundingBox.Empty;
                foreach (var g in preview) box.Union(g.GetBoundingBox(true));
                gp.DynamicDraw += (s, e) =>
                {
                    if (!box.IsValid) return;
                    var moved = box;
                    moved.Transform(Transform.Translation(e.CurrentPoint - Point3d.Origin));
                    e.Display.DrawBox(moved, System.Drawing.Color.FromArgb(232, 93, 4));
                };
                var res = gp.Get();
                if (res != GetResult.Point) break;
                var attrs = doc.CreateDefaultAttributes();
                foreach (var t in item.Tags("model")) attrs.SetUserString(Commands.Prefix + t.Key, t.Value);
                attrs.Name = idef.Name;
                var id = doc.Objects.AddInstanceObject(index, Transform.Translation(gp.Point() - Point3d.Origin), attrs);
                if (id != Guid.Empty) placed++;
                doc.Views.Redraw();
            }
            if (placed > 0)
                Commands.Toast(Lang.T("Placed {n} × {name}. It is in the Block Manager for more copies (Insert).", "n", placed, "name", idef.Name));
            return placed > 0 ? Result.Success : Result.Cancel;
        }

        /// The block for this asset version: found by its marker, or imported
        /// from the .skp. Rhino's SketchUp importer adds loose objects (and
        /// nested blocks for SketchUp components); those become the block's
        /// geometry and are then removed from the model.
        private static int EnsureBlock(RhinoDoc doc, Commands.Pending item, out bool created)
        {
            created = false;
            foreach (var d in doc.InstanceDefinitions)
                if (d != null && !d.IsDeleted && (d.Description ?? "").Contains(item.Marker)) return d.Index;

            uint firstNew = RhinoObject.NextRuntimeSerialNumber;
            bool imported;
            doc.Objects.UnselectAll();
            try { imported = doc.Import(item.Path); }
            catch (Exception e) { Commands.Toast(Lang.T("Rhino could not import the SketchUp file: {error}", "error", e.Message)); return -1; }
            var added = doc.Objects.GetObjectList(new ObjectEnumeratorSettings { IncludeLights = true, HiddenObjects = true, LockedObjects = true })
                .Where(o => o.RuntimeSerialNumber >= firstNew).ToList();
            if (!imported || added.Count == 0)
            {
                Commands.Toast(Lang.T("Rhino could not import the SketchUp file for {name}.", "name", item.Label));
                return -1;
            }

            string name = Commands.SafeName("Dirory - " + item.Label);
            string unique = name;
            for (int n = 2; doc.InstanceDefinitions.Find(unique) != null; n++) unique = $"{name} ({n})";
            string description = $"{item.Label} — Dirory {item.Marker}";
            int index = doc.InstanceDefinitions.Add(unique, description, item.ProductUrl, item.Label,
                Point3d.Origin, added.Select(o => o.Geometry.Duplicate()), added.Select(o => o.Attributes.Duplicate()));
            foreach (var o in added) doc.Objects.Delete(o, true);
            if (index < 0)
            {
                Commands.Toast(Lang.T("Rhino could not make a block from {name}.", "name", item.Label));
                return -1;
            }
            created = true;
            return index;
        }
    }

    // -------------------------------------------------------------------- paint

    public class DiroryPaintCommand : Command
    {
        public override string EnglishName => "DiroryPaint";

        protected override Result RunCommand(RhinoDoc doc, RunMode mode)
        {
            var item = Commands.Take();
            if (item == null)
            {
                RhinoApp.WriteLine(Lang.T("Dirory: click a material card in the Dirory panel to paint it."));
                return Result.Nothing;
            }
            var material = EnsureMaterial(doc, item, out bool created);
            if (material == null) return Result.Failure;

            // The selection, or objects picked now (Enter with none: just add the material).
            var go = new GetObject();
            go.SetCommandPrompt(Lang.T("Select objects to paint with {name} (Enter: only add the material)", "name", material.Name));
            go.GeometryFilter = ObjectType.Brep | ObjectType.Extrusion | ObjectType.Mesh | ObjectType.SubD |
                                ObjectType.Surface | ObjectType.InstanceReference;
            go.SubObjectSelect = false;
            go.EnablePreSelect(true, true);
            go.AcceptNothing(true);
            if (doc.Objects.GetSelectedObjects(false, false).Any() == false)
                Commands.Toast(Lang.T("\"{name}\" is ready. Select objects in the model to paint, then press Enter.", "name", material.Name));
            var res = go.GetMultiple(1, 0);
            if (res != GetResult.Object || go.ObjectCount == 0)
            {
                Commands.Toast(Lang.T("\"{name}\" is in the Materials panel. Select objects first, then click the card again to paint them.", "name", material.Name));
                return created ? Result.Success : Result.Nothing;
            }
            int n = 0;
            foreach (var r in go.Objects())
            {
                var obj = r.Object();
                if (obj == null) continue;
                obj.RenderMaterial = material;
                obj.CommitChanges();
                n++;
            }
            doc.Views.Redraw();
            Commands.Toast(Lang.T("Painted {n} object(s) with {material}.", "n", n, "material", material.Name));
            return Result.Success;
        }

        /// The render material for this asset version, found by its marker in
        /// the notes or created: a Custom material whose texture is projected in
        /// world coordinates and repeats once per real tile (tile_size_cm).
        public static RenderMaterial EnsureMaterial(RhinoDoc doc, Commands.Pending item, out bool created)
        {
            created = false;
            foreach (var rm in doc.RenderMaterials)
                if ((rm.Notes ?? "").Contains(item.Marker)) return rm;

            string name = Commands.SafeName("Dirory - " + item.Label);
            string unique = name;
            for (int n = 2; doc.RenderMaterials.Any(m => m.Name == unique); n++) unique = $"{name} ({n})";

            var basic = new Material { Name = unique };
            var glass = Glass(item.Appearance);
            if (glass != null)
            {
                basic.DiffuseColor = glass.Value.color;
                basic.Transparency = 1 - glass.Value.opacity;
                basic.Reflectivity = glass.Value.reflectivity;
                basic.IndexOfRefraction = 1.52;
            }
            else
            {
                basic.SetBitmapTexture(item.Path);
            }
            foreach (var t in item.Tags("material")) basic.SetUserString(Commands.Prefix + t.Key, t.Value);

            var material = RenderMaterial.CreateBasicMaterial(basic, doc);
            if (material == null) { Commands.Toast(Lang.T("Rhino could not create the material {name}.", "name", unique)); return null; }
            material.BeginChange(RenderContent.ChangeContexts.Program);
            material.Name = unique;
            var notes = new StringBuilder($"Dirory material ({item.Marker})");
            foreach (var t in item.Tags("material")) notes.Append($"\n{Commands.Prefix}{t.Key}={t.Value}");
            material.Notes = notes.ToString();
            material.EndChange();

            // Real-world size: a WCS box projection repeats per metre of model,
            // whatever the model's units, so one tile of w cm repeats 100/w times.
            var texture = material.GetTextureFromUsage(RenderMaterial.StandardChildSlots.Diffuse);
            if (texture != null && item.TileWidthCm > 0)
            {
                double h = item.TileHeightCm > 0 ? item.TileHeightCm : item.TileWidthCm;
                texture.BeginChange(RenderContent.ChangeContexts.Program);
                texture.SetProjectionMode(TextureProjectionMode.WcsBox, RenderContent.ChangeContexts.Program);
                texture.SetRepeatLocked(false, RenderContent.ChangeContexts.Program);
                texture.SetRepeat(new Vector3d(100.0 / item.TileWidthCm, 100.0 / h, 1), RenderContent.ChangeContexts.Program);
                texture.EndChange();
            }
            if (!doc.RenderMaterials.Add(material))
            {
                Commands.Toast(Lang.T("Rhino could not create the material {name}.", "name", unique));
                return null;
            }
            created = true;
            // The table holds its own copy: return that one.
            return doc.RenderMaterials.FirstOrDefault(m => (m.Notes ?? "").Contains(item.Marker)) ?? material;
        }

        private static (System.Drawing.Color color, double opacity, double reflectivity)? Glass(Dictionary<string, object> look)
        {
            if (look == null || Json.Str(look, "kind") != "glass") return null;
            var inv = CultureInfo.InvariantCulture;
            double Num(string key, double fallback) =>
                double.TryParse(Json.Str(look, key), NumberStyles.Any, inv, out var v) ? Math.Max(0, Math.Min(1, v)) : fallback;
            var color = System.Drawing.Color.FromArgb(200, 220, 215);
            if (look.TryGetValue("color", out var c) && c is System.Collections.ArrayList rgb && rgb.Count >= 3)
            {
                int B(object v) => (int)Math.Max(0, Math.Min(255, Math.Round(Convert.ToDouble(v, inv))));
                color = System.Drawing.Color.FromArgb(B(rgb[0]), B(rgb[1]), B(rgb[2]));
            }
            return (color, Num("opacity", 0.25), Num("reflectivity", 0.08));
        }
    }
}
