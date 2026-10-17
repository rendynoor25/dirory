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
//   extras                    railings (m, on a stair or not), stairs that are
//                             not concrete (per type) and casework (m, its
//                             longest side): rab.js lists them under 'misc'
// Rows carry `spec`, the type's layer materials, so rab.js can tell a hebel
// wall from a brick one and a granite floor from a ceramic one.
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
        private static readonly Regex StairRe = new Regex(@"stair|tangga|handrail", RegexOptions.IgnoreCase);
        private const double SqFtToM2 = 0.09290304;
        private const double FtToM = 0.3048;

        /// `phaseId`: the phase to price (its id as text); empty for the last phase.
        public static Dictionary<string, object> Run(Document doc, string phaseId = "")
        {
            var ph = Phasing.For(doc, phaseId);
            var rows = new Dictionary<string, Dictionary<string, object>>();
            var (structure, concreteHosts) = StructureTakeoff.Run(doc, ph);
            var mep = MepTakeoff.Run(doc, ph);

            void Add(string element, string material, string category, double areaM2, string core = "", string spec = "")
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
                    if (spec != "") row["spec"] = spec;
                    rows[key] = row;
                }
                row["faces"] = (int)row["faces"] + 1;
                row["area_m2"] = (double)row["area_m2"] + areaM2;
            }

            double Area(Element e) => (e.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0) * SqFtToM2;
            double Volume(Element e) => (e.get_Parameter(BuiltInParameter.HOST_VOLUME_COMPUTED)?.AsDouble() ?? 0) * 0.028316846592;

            // Existing elements are skipped; demolished ones go to the
            // demolition list (a concrete wall's or slab's concrete is recorded
            // by StructureTakeoff).
            foreach (Wall w in new FilteredElementCollector(doc).OfClass(typeof(Wall)).WhereElementIsNotElementType())
            {
                if (w.WallType.Kind == WallKind.Curtain) continue;
                string status = ph.Status(w);
                if (status == "demolished" && !concreteHosts.Contains(w.Id))
                    ph.Demolish("masonry", w.WallType.Name, "m3", Volume(w));
                if (status != "new") continue;
                Add("wall", w.WallType.Name, IsTiled(doc, w.WallType) ? "Tiles" : "", 2 * Area(w),
                    concreteHosts.Contains(w.Id) ? "concrete" : "", Spec(doc, w.WallType));
            }
            foreach (Floor f in new FilteredElementCollector(doc).OfClass(typeof(Floor)).WhereElementIsNotElementType())
            {
                string status = ph.Status(f);
                bool tiled = IsTiled(doc, f.FloorType);
                // A bare concrete slab's demolition is its concrete (StructureTakeoff);
                // only a finish on it is removed as well.
                if (status == "demolished" && (tiled || !concreteHosts.Contains(f.Id)))
                    ph.Demolish(tiled ? "floor_tiled" : "floor", f.FloorType.Name, "m2", Area(f));
                if (status == "new") Add("floor", f.FloorType.Name, tiled ? "Tiles" : "", Area(f), "", Spec(doc, f.FloorType));
            }
            foreach (Element c in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Ceilings).WhereElementIsNotElementType())
            {
                string status = ph.Status(c), name = doc.GetElement(c.GetTypeId())?.Name ?? "Ceiling";
                if (status == "demolished") ph.Demolish("ceiling", name, "m2", Area(c));
                if (status == "new") Add("ceiling", name, "", Area(c));
            }
            foreach (RoofBase r in new FilteredElementCollector(doc).OfClass(typeof(RoofBase)).WhereElementIsNotElementType())
            {
                string status = ph.Status(r);
                if (status == "demolished") ph.Demolish("roof", r.RoofType.Name, "m2", Area(r));
                if (status == "new") Add("roof", r.RoofType.Name, "", Area(r), "", Spec(doc, r.RoofType));
            }

            var openings = new Dictionary<string, Dictionary<string, object>>();
            void Opening(BuiltInCategory cat, string kind, BuiltInParameter wp, BuiltInParameter hp)
            {
                foreach (FamilyInstance fi in new FilteredElementCollector(doc).OfCategory(cat).OfClass(typeof(FamilyInstance)))
                {
                    var sym = fi.Symbol;
                    double w = (sym.get_Parameter(wp)?.AsDouble() ?? sym.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)?.AsDouble() ?? 0) * FtToM;
                    double h = (sym.get_Parameter(hp)?.AsDouble() ?? sym.get_Parameter(BuiltInParameter.FAMILY_HEIGHT_PARAM)?.AsDouble() ?? 0) * FtToM;
                    string status = ph.Status(fi);
                    if (status == "demolished") ph.Demolish(kind, sym.FamilyName + " : " + sym.Name, "unit", 1, w);
                    if (status != "new") continue;
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

            // Railings, stairs that are not concrete, casework.
            var extras = new Dictionary<string, Dictionary<string, object>>();
            void Extra(Element e, string group, string name, string unit, double qty, bool onStair = false)
            {
                if (qty <= 0) return;
                string status = ph.Status(e);
                if (status == "demolished") ph.Demolish(group, name, unit, qty);
                if (status != "new") return;
                string key = group + "|" + name;
                if (!extras.TryGetValue(key, out var x))
                {
                    x = new Dictionary<string, object>
                    {
                        ["group"] = group, ["name"] = name, ["unit"] = unit, ["quantity"] = 0.0, ["on_stair"] = onStair,
                    };
                    extras[key] = x;
                }
                x["quantity"] = (double)x["quantity"] + qty;
            }
            foreach (Railing rl in new FilteredElementCollector(doc).OfClass(typeof(Railing)).WhereElementIsNotElementType().Cast<Railing>())
            {
                double len = rl.GetPath().Sum(c => c.Length) * FtToM;
                string name = StructureTakeoff.TypeName(doc, rl);
                bool onStair = rl.HostId != ElementId.InvalidElementId && doc.GetElement(rl.HostId) is Stairs ||
                               StairRe.IsMatch(name);
                Extra(rl, "railing", name, "m", len, onStair);
            }
            foreach (Element st in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Stairs).WhereElementIsNotElementType())
            {
                if (!(st is Stairs) && !(st is FamilyInstance)) continue;
                if (concreteHosts.Contains(st.Id)) continue;
                Extra(st, "stair", StructureTakeoff.TypeName(doc, st), "unit", 1);
            }
            foreach (FamilyInstance cw in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Casework).OfClass(typeof(FamilyInstance)).Cast<FamilyInstance>())
            {
                var bb = cw.get_BoundingBox(null);
                if (bb == null) continue;
                double len = Math.Max(bb.Max.X - bb.Min.X, bb.Max.Y - bb.Min.Y) * FtToM;
                Extra(cw, "casework", cw.Symbol.FamilyName + " : " + cw.Symbol.Name, "m", len);
            }

            // Rooms belong to one phase; use the rooms of the priced phase.
            double perimeter = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms)
                .WhereElementIsNotElementType().OfType<Room>()
                .Where(r => r.Area > 0 && (ph.PhaseId == ElementId.InvalidElementId ||
                                           r.get_Parameter(BuiltInParameter.ROOM_PHASE)?.AsElementId() == ph.PhaseId))
                .Sum(r => r.Perimeter) * FtToM;
            var demolition = ph.Demolished();

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
                ph.PhaseName != ""
                    ? $"Phase \"{ph.PhaseName}\": new construction is priced, existing elements are not, and elements this phase demolishes are priced as demolition."
                    : "",
                "An estimate from the model: check it before a tender.",
            };
            notes.RemoveAll(n => n == "");
            return new Dictionary<string, object>
            {
                ["rows"] = list,
                ["totals"] = totals,
                ["openings"] = openings.Values.OrderBy(o => (string)o["kind"]).ThenBy(o => (string)o["name"]).ToList(),
                ["floor_perimeter_m"] = Math.Round(perimeter, 2),
                ["structure"] = structure,
                ["mep"] = mep,
                ["demolition"] = demolition,
                ["extras"] = extras.Values.Select(x => { x["quantity"] = Math.Round((double)x["quantity"], 2); return x; })
                    .OrderBy(x => (string)x["group"]).ThenBy(x => (string)x["name"]).ToList(),
                // Names the exported RAB; stays in the panel, never sent.
                ["project"] = doc.Title ?? "",
                ["phase"] = ph.PhaseId == ElementId.InvalidElementId ? "" : ph.PhaseId.Value.ToString(),
                ["phases"] = Phasing.List(doc),
                ["components_skipped"] = 0,
                ["notes"] = notes,
            };
        }

        /// The type's layer material names, for rab.js to read (hebel, granit ...).
        private static string Spec(Document doc, HostObjAttributes type)
        {
            var cs = type.GetCompoundStructure();
            if (cs == null) return "";
            return string.Join(", ", cs.GetLayers()
                .Select(l => doc.GetElement(l.MaterialId)?.Name)
                .Where(n => !string.IsNullOrEmpty(n)).Distinct());
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
