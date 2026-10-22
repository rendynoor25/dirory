// The Quantifier's usage report for Rhino: which Dirory products and
// materials the open model uses, in the shape of the SketchUp plugin's
// usage_report (main.rb), so the shared panel shows it the same way:
//
//   models:    one row per Dirory block, `count` = placed instances
//   materials: one row per Dirory material, `faces` and `area_m2` painted
//
// Blocks are walked with their transforms, so a Dirory product or painted
// surface inside another block counts once per copy, at that copy's scale.
// Objects whose material comes from their parent take the parent's.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;
using Rhino.Render;

namespace DiroryRhino
{
    public static class Report
    {
        public static Dictionary<string, object> Build(RhinoDoc doc)
        {
            var models = new Dictionary<string, Dictionary<string, object>>();
            var materials = new Dictionary<string, Dictionary<string, object>>();
            var materialIds = new Dictionary<Guid, string>();   // render material id -> report key

            // Every Dirory material in the file, used or not (the panel can hide unused ones).
            foreach (var rm in doc.RenderMaterials)
            {
                var tags = TagsFromNotes(rm.Notes);
                if (!tags.TryGetValue("asset_id", out var assetId) || assetId == "") continue;
                string key = assetId;
                materialIds[rm.Id] = key;
                if (!materials.ContainsKey(key))
                {
                    var row = Row(key, tags, "material", rm.Name);
                    row["faces"] = 0;
                    row["area"] = 0.0;
                    materials[key] = row;
                }
            }

            // Every Dirory block, used or not.
            foreach (var idef in doc.InstanceDefinitions)
            {
                if (idef == null || idef.IsDeleted) continue;
                string assetId = AssetFromMarker(idef.Description);
                if (assetId == "" || models.ContainsKey(assetId)) continue;
                var row = Row(assetId, new Dictionary<string, string>(), "model",
                    idef.Name.StartsWith("Dirory - ") ? idef.Name.Substring("Dirory - ".Length) : idef.Name);
                row["count"] = 0;
                models[assetId] = row;
            }

            double toSquareMetres = Math.Pow(RhinoMath.UnitScale(doc.ModelUnitSystem, UnitSystem.Meters), 2);
            var settings = new ObjectEnumeratorSettings { HiddenObjects = true, LockedObjects = true, ReferenceObjects = true };
            foreach (var obj in doc.Objects.GetObjectList(settings))
                Walk(doc, obj, Transform.Identity, null, models, materials, materialIds, 0);

            foreach (var row in materials.Values)
            {
                row["area_m2"] = Math.Round((double)row["area"] * toSquareMetres, 2);
                row.Remove("area");
            }

            string Sort(Dictionary<string, object> r) =>
                $"{Json.Str(r, "brand").ToLowerInvariant()}|{Json.Str(r, "category").ToLowerInvariant()}|{Json.Str(r, "name").ToLowerInvariant()}";
            return new Dictionary<string, object>
            {
                ["models"] = models.Values.OrderBy(Sort).ToList(),
                ["materials"] = materials.Values.OrderBy(Sort).ToList(),
            };
        }

        private static void Walk(RhinoDoc doc, RhinoObject obj, Transform xform, RenderMaterial parentMaterial,
            Dictionary<string, Dictionary<string, object>> models,
            Dictionary<string, Dictionary<string, object>> materials,
            Dictionary<Guid, string> materialIds, int depth)
        {
            if (obj == null || depth > 32) return;
            var attrs = obj.Attributes;
            RenderMaterial material = attrs.MaterialSource == ObjectMaterialSource.MaterialFromParent && parentMaterial != null
                ? parentMaterial
                : obj.RenderMaterial;

            if (obj is InstanceObject instance)
            {
                var idef = instance.InstanceDefinition;
                if (idef == null) return;
                string assetId = attrs.GetUserString(Commands.Prefix + "asset_id");
                if (string.IsNullOrEmpty(assetId)) assetId = AssetFromMarker(idef.Description);
                if (!string.IsNullOrEmpty(assetId))
                {
                    if (!models.TryGetValue(assetId, out var row))
                    {
                        row = Row(assetId, new Dictionary<string, string>(), "model", idef.Name);
                        row["count"] = 0;
                        models[assetId] = row;
                    }
                    // The instance's own tags are fuller than the block's name.
                    FillFromUserStrings(row, attrs);
                    row["count"] = (int)row["count"] + 1;
                }
                var inner = xform * instance.InstanceXform;
                foreach (var child in idef.GetObjects())
                    Walk(doc, child, inner, material, models, materials, materialIds, depth + 1);
                return;
            }

            if (material == null || !materialIds.TryGetValue(material.Id, out var key)) return;
            var (faces, area) = Measure(obj.Geometry, xform);
            if (faces == 0) return;
            var mat = materials[key];
            mat["faces"] = (int)mat["faces"] + faces;
            mat["area"] = (double)mat["area"] + area;
        }

        /// Faces and surface area (model units squared) of one object, transformed.
        private static (int faces, double area) Measure(GeometryBase geometry, Transform xform)
        {
            if (geometry == null) return (0, 0);
            var g = geometry.Duplicate();
            if (!xform.IsIdentity) g.Transform(xform);
            Brep brep = null;
            switch (g)
            {
                case Brep b: brep = b; break;
                case Extrusion e: brep = e.ToBrep(); break;
                case Surface s: brep = s.ToBrep(); break;
                case SubD d: brep = d.ToBrep(new SubDToBrepOptions()); break;
                case Mesh m:
                    var mp = AreaMassProperties.Compute(m);
                    return (m.Faces.Count, mp?.Area ?? 0);
            }
            if (brep == null) return (0, 0);
            var props = AreaMassProperties.Compute(brep);
            return (brep.Faces.Count, props?.Area ?? 0);
        }

        private static Dictionary<string, object> Row(string assetId, Dictionary<string, string> tags, string type, string fallbackName)
        {
            string T(string k) => tags.TryGetValue(k, out var v) ? v : "";
            string brand = T("brand");
            return new Dictionary<string, object>
            {
                ["id"] = assetId,
                ["asset_id"] = assetId,
                ["name"] = T("name") != "" ? T("name") : fallbackName,
                ["category"] = T("category"),
                ["brand"] = brand.Trim() == "" ? "Dirory" : brand,
                ["type"] = type,
                ["tile_size"] = T("tile_size"),
                ["dimensions"] = T("dimensions"),
                ["sku"] = T("sku"),
                ["product_url"] = T("product_url"),
                ["tags"] = "",
            };
        }

        private static void FillFromUserStrings(Dictionary<string, object> row, ObjectAttributes attrs)
        {
            foreach (var k in new[] { "name", "brand", "category", "sku", "product_url", "dimensions" })
            {
                string v = attrs.GetUserString(Commands.Prefix + k);
                if (!string.IsNullOrEmpty(v)) row[k] = v;
            }
        }

        /// "Dirory.key=value" lines, as DiroryPaint writes a material's notes.
        private static Dictionary<string, string> TagsFromNotes(string notes)
        {
            var tags = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(notes) || !notes.Contains("dirory:")) return tags;
            foreach (var line in notes.Split('\n'))
            {
                string l = line.Trim();
                if (!l.StartsWith(Commands.Prefix)) continue;
                int eq = l.IndexOf('=');
                if (eq < 0) continue;
                tags[l.Substring(Commands.Prefix.Length, eq - Commands.Prefix.Length)] = l.Substring(eq + 1);
            }
            return tags;
        }

        /// The asset id in a block's "dirory:<asset_id>:v<version>" marker.
        private static string AssetFromMarker(string description)
        {
            if (string.IsNullOrEmpty(description)) return "";
            int i = description.IndexOf("dirory:", StringComparison.Ordinal);
            if (i < 0) return "";
            string rest = description.Substring(i + "dirory:".Length);
            int end = rest.IndexOf(":v", StringComparison.Ordinal);
            return end > 0 ? rest.Substring(0, end) : "";
        }
    }
}
