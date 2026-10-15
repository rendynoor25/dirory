// Quantity takeoff from Revit elements, in the same shape as the SketchUp
// plugin's takeoff.rb, so the shared rab.js prices it unchanged.
//
// Revit knows what things are, so nothing is guessed from face directions:
//   walls     HOST_AREA_COMPUTED (one face) x 2 -> both finish faces, which
//             rab.js halves again for masonry (wallsBothSides = true)
//   floors, ceilings, roofs   HOST_AREA_COMPUTED (roof area includes slope)
//   doors, windows            counted per type with the type's width/height
//   skirting                  sum of room perimeters, when rooms are placed
//   structure                 concrete, formwork, rebar and steel per member
//                             (StructureTakeoff.cs)
//   mep                       pipe and duct runs, fixtures and devices
//                             (MepTakeoff.cs)
// A type is treated as tiled when its name or any layer material says so.
// A wall with concrete in it is marked core = "concrete": rab.js prices its
// finishes but not as brick or block masonry, since the structure section
// already prices its concrete.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;

namespace Dirory.Revit
{
    public static class Takeoff
    {
        private static readonly Regex TileRe = new Regex(@"\b(tile|tiles|keramik|ceramic|granit|granite|porselen|porcelain|homogen\w*)\b", RegexOptions.IgnoreCase);
        private const double SqFtToM2 = 0.09290304;
        private const double FtToM = 0.3048;

        public static Dictionary<string, object> Run(Document doc)
        {
            var rows = new Dictionary<string, Dictionary<string, object>>();
            var (structure, concreteWalls) = StructureTakeoff.Run(doc);
            var mep = MepTakeoff.Run(doc);

            void Add(string element, string material, string category, double areaM2, string core = "")
            {
                if (areaM2 <= 0) return;
                string key = element + "|" + material + "|" + core;
                if (!rows.TryGetValue(key, out var row))
                {
                    row = new Dictionary<string, object>
                    {
                        ["element"] = element, ["material"] = material, ["brand"] = "",
                        ["category"] = category, ["dirory"] = material.StartsWith("Dirory - "),
                        ["faces"] = 0, ["area_m2"] = 0.0,
                    };
                    if (core != "") row["core"] = core;
                    rows[key] = row;
                }
                row["faces"] = (int)row["faces"] + 1;
                row["area_m2"] = (double)row["area_m2"] + areaM2;
            }

            double Area(Element e) => (e.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0) * SqFtToM2;

            foreach (Wall w in new FilteredElementCollector(doc).OfClass(typeof(Wall)).WhereElementIsNotElementType())
            {
                if (w.WallType.Kind == WallKind.Curtain) continue;
                Add("wall", w.WallType.Name, IsTiled(doc, w.WallType) ? "Tiles" : "", 2 * Area(w),
                    concreteWalls.Contains(w.Id) ? "concrete" : "");
            }
            foreach (Floor f in new FilteredElementCollector(doc).OfClass(typeof(Floor)).WhereElementIsNotElementType())
                Add("floor", f.FloorType.Name, IsTiled(doc, f.FloorType) ? "Tiles" : "", Area(f));
            foreach (Element c in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Ceilings).WhereElementIsNotElementType())
                Add("ceiling", doc.GetElement(c.GetTypeId())?.Name ?? "Ceiling", "", Area(c));
            foreach (RoofBase r in new FilteredElementCollector(doc).OfClass(typeof(RoofBase)).WhereElementIsNotElementType())
                Add("roof", r.RoofType.Name, "", Area(r));

            var openings = new Dictionary<string, Dictionary<string, object>>();
            void Opening(BuiltInCategory cat, string kind, BuiltInParameter wp, BuiltInParameter hp)
            {
                foreach (FamilyInstance fi in new FilteredElementCollector(doc).OfCategory(cat).OfClass(typeof(FamilyInstance)))
                {
                    var sym = fi.Symbol;
                    double w = (sym.get_Parameter(wp)?.AsDouble() ?? sym.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)?.AsDouble() ?? 0) * FtToM;
                    double h = (sym.get_Parameter(hp)?.AsDouble() ?? sym.get_Parameter(BuiltInParameter.FAMILY_HEIGHT_PARAM)?.AsDouble() ?? 0) * FtToM;
                    string key = kind + "|" + sym.Id;
                    if (!openings.TryGetValue(key, out var o))
                    {
                        o = new Dictionary<string, object>
                        {
                            ["kind"] = kind, ["name"] = sym.FamilyName + " : " + sym.Name, ["brand"] = "", ["sku"] = "",
                            ["width_m"] = Math.Round(w, 2), ["height_m"] = Math.Round(h, 2), ["count"] = 0,
                        };
                        openings[key] = o;
                    }
                    o["count"] = (int)o["count"] + 1;
                }
            }
            Opening(BuiltInCategory.OST_Doors, "door", BuiltInParameter.DOOR_WIDTH, BuiltInParameter.DOOR_HEIGHT);
            Opening(BuiltInCategory.OST_Windows, "window", BuiltInParameter.WINDOW_WIDTH, BuiltInParameter.WINDOW_HEIGHT);

            double perimeter = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms)
                .WhereElementIsNotElementType().OfType<Room>().Where(r => r.Area > 0).Sum(r => r.Perimeter) * FtToM;

            var list = rows.Values.Select(r => { r["area_m2"] = Math.Round((double)r["area_m2"], 2); return r; })
                .OrderBy(r => Array.IndexOf(new[] { "wall", "floor", "ceiling", "roof" }, (string)r["element"]))
                .ThenByDescending(r => (double)r["area_m2"]).ToList();
            var totals = list.GroupBy(r => (string)r["element"])
                .ToDictionary(g => g.Key, g => (object)Math.Round(g.Sum(r => (double)r["area_m2"]), 2));

            var notes = new List<string>
            {
                "Measured from Revit elements: wall areas count both faces, openings are already deducted.",
                perimeter > 0 ? "Skirting uses the perimeter of the placed rooms." : "Place rooms to get the skirting length.",
                structure.Count > 0
                    ? "Structure: concrete volumes from concrete materials; formwork from the vertical faces, plus soffits of beams and suspended slabs; rebar weight from modelled rebar, otherwise estimated per m3 of concrete."
                    : "No structural members found: model foundations, columns, beams and slabs with concrete materials to price the structure.",
                mep.Count > 0
                    ? "MEP: pipe lengths per system and size (fittings are included in the pipe rates), duct surface areas, and fixtures and devices counted per type."
                    : "No MEP elements found.",
                "An estimate from the model: check it before a tender.",
            };
            return new Dictionary<string, object>
            {
                ["rows"] = list,
                ["totals"] = totals,
                ["openings"] = openings.Values.OrderBy(o => (string)o["kind"]).ThenBy(o => (string)o["name"]).ToList(),
                ["floor_perimeter_m"] = Math.Round(perimeter, 2),
                ["structure"] = structure,
                ["mep"] = mep,
                ["components_skipped"] = 0,
                ["notes"] = notes,
            };
        }

        private static bool IsTiled(Document doc, HostObjAttributes type)
        {
            if (TileRe.IsMatch(type.Name)) return true;
            var cs = type.GetCompoundStructure();
            if (cs == null) return false;
            return cs.GetLayers().Any(l => l.MaterialId != ElementId.InvalidElementId &&
                                           TileRe.IsMatch(doc.GetElement(l.MaterialId)?.Name ?? ""));
        }
    }
}
