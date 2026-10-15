// Structural quantities from Revit elements, for the structure section of the
// RAB (rab.js prices them with the concrete, rebar, formwork and steel items).
//
// Members and how each is recognised:
//   footing    Structural Foundations (isolated, wall and slab foundations)
//   tie_beam   Structural Framing on the lowest level, or named sloof / tie beam
//   column     Structural Columns
//   beam       other Structural Framing
//   slab       Floors with concrete in them
//   wall       Walls with concrete in them (shear walls, core walls)
//
// Per element:
//   concrete   volume of its concrete materials (Element.GetMaterialVolume),
//              or its computed volume when the family says it is concrete
//   formwork   contact area from its solid geometry: the vertical faces, plus
//              the soffit for beams and suspended slabs. Revit has already cut
//              the joins, so faces buried in a column or slab are not counted.
//   rebar      weight of the rebar modelled in it (length x bar area x 7850);
//              an element with none is reported as `rebar_ratio_m3`, and rab.js
//              applies a kg per m3 ratio to that volume.
//   steel      steel members: volume x 7850 kg/m3.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace Dirory.Revit
{
    public static class StructureTakeoff
    {
        private static readonly Regex ConcreteRe = new Regex(@"concrete|beton|cast[\s-]?in|precast|pracetak|\bf'?c\b|\bK-?\d{3}\b", RegexOptions.IgnoreCase);
        private static readonly Regex SteelRe = new Regex(@"steel|baja|\bWF\b|\bIWF\b|\bH-?beam\b|metal", RegexOptions.IgnoreCase);
        private static readonly Regex TieBeamRe = new Regex(@"sloof|tie[\s_-]?beam|ground[\s_-]?beam|\bTB\d*\b", RegexOptions.IgnoreCase);
        private const double Ft3ToM3 = 0.028316846592;
        private const double Ft2ToM2 = 0.09290304;
        private const double FtToM = 0.3048;
        private const double SteelKgPerM3 = 7850;

        public static string[] Members = { "footing", "tie_beam", "column", "beam", "slab", "wall" };

        /// Rows grouped by member and type; walls with concrete in them, so the
        /// architectural takeoff does not price them again as masonry.
        /// New construction in the priced phase; demolished concrete and steel go to `ph`.
        public static (List<Dictionary<string, object>> rows, HashSet<ElementId> concreteWalls) Run(Document doc, Phasing ph)
        {
            var rows = new Dictionary<string, Dictionary<string, object>>();
            var concreteWalls = new HashSet<ElementId>();
            var rebarKg = RebarByHost(doc);
            double lowest = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                .Select(l => l.Elevation).DefaultIfEmpty(0).Min();

            Dictionary<string, object> Row(string member, string name)
            {
                string key = member + "|" + name;
                if (!rows.TryGetValue(key, out var row))
                {
                    row = new Dictionary<string, object>
                    {
                        ["member"] = member, ["name"] = name, ["count"] = 0,
                        ["concrete_m3"] = 0.0, ["formwork_m2"] = 0.0, ["rebar_kg"] = 0.0,
                        ["rebar_ratio_m3"] = 0.0, ["steel_kg"] = 0.0,
                    };
                    rows[key] = row;
                }
                return row;
            }
            void Bump(Dictionary<string, object> row, string field, double v) => row[field] = (double)row[field] + v;

            void AddConcrete(Element e, string member, bool soffit)
            {
                double m3 = ConcreteVolume(doc, e);
                if (m3 <= 0) return;
                string status = ph.Status(e);
                if (status == "demolished") ph.Demolish("concrete", TypeName(doc, e), "m3", m3);
                if (status != "new") return;
                var row = Row(member, TypeName(doc, e));
                row["count"] = (int)row["count"] + 1;
                Bump(row, "concrete_m3", m3);
                Bump(row, "formwork_m2", Formwork(e, soffit));
                if (rebarKg.TryGetValue(e.Id, out double kg)) Bump(row, "rebar_kg", kg);
                else Bump(row, "rebar_ratio_m3", m3);
            }

            void AddSteel(Element e, string member)
            {
                double m3 = Volume(e);
                if (m3 <= 0) return;
                string status = ph.Status(e);
                if (status == "demolished") ph.Demolish("steel", TypeName(doc, e), "kg", m3 * SteelKgPerM3);
                if (status != "new") return;
                var row = Row("steel", member == "column" ? "Column: " + TypeName(doc, e) : "Beam: " + TypeName(doc, e));
                row["count"] = (int)row["count"] + 1;
                Bump(row, "steel_kg", m3 * SteelKgPerM3);
            }

            foreach (Element e in Collect(doc, BuiltInCategory.OST_StructuralFoundation))
                AddConcrete(e, "footing", false);

            foreach (FamilyInstance fi in Collect(doc, BuiltInCategory.OST_StructuralColumns).OfType<FamilyInstance>())
            {
                if (IsSteel(doc, fi)) AddSteel(fi, "column");
                else AddConcrete(fi, "column", false);
            }

            foreach (FamilyInstance fi in Collect(doc, BuiltInCategory.OST_StructuralFraming).OfType<FamilyInstance>())
            {
                if (fi.StructuralType == StructuralType.Brace || IsSteel(doc, fi)) { AddSteel(fi, "beam"); continue; }
                bool tie = TieBeamRe.IsMatch(TypeName(doc, fi)) || LevelElevation(doc, fi) <= lowest + 0.01;
                AddConcrete(fi, tie ? "tie_beam" : "beam", !tie);
            }

            foreach (Floor f in Collect(doc, BuiltInCategory.OST_Floors).OfType<Floor>())
                AddConcrete(f, "slab", LevelElevation(doc, f) > lowest + 0.01);

            foreach (Wall w in new FilteredElementCollector(doc).OfClass(typeof(Wall)).WhereElementIsNotElementType().Cast<Wall>())
            {
                if (w.WallType.Kind == WallKind.Curtain || ConcreteVolume(doc, w) <= 0) continue;
                concreteWalls.Add(w.Id);
                AddConcrete(w, "wall", false);
            }

            var list = rows.Values.Select(r =>
            {
                foreach (var f in new[] { "concrete_m3", "formwork_m2", "rebar_kg", "rebar_ratio_m3", "steel_kg" })
                    r[f] = Math.Round((double)r[f], f == "rebar_kg" || f == "steel_kg" ? 1 : 2);
                return r;
            })
            .OrderBy(r => { int i = Array.IndexOf(Members, (string)r["member"]); return i < 0 ? 99 : i; })
            .ThenBy(r => (string)r["name"]).ToList();
            return (list, concreteWalls);
        }

        private static IEnumerable<Element> Collect(Document doc, BuiltInCategory cat) =>
            new FilteredElementCollector(doc).OfCategory(cat).WhereElementIsNotElementType();

        private static string TypeName(Document doc, Element e)
        {
            var t = doc.GetElement(e.GetTypeId()) as ElementType;
            if (t == null) return e.Name;
            return string.IsNullOrEmpty(t.FamilyName) || t.FamilyName == t.Name ? t.Name : t.FamilyName + " : " + t.Name;
        }

        private static double LevelElevation(Document doc, Element e)
        {
            var id = e.LevelId;
            if (id == ElementId.InvalidElementId)
                id = e.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM)?.AsElementId() ?? ElementId.InvalidElementId;
            return (doc.GetElement(id) as Level)?.Elevation ?? double.MaxValue;
        }

        private static double Volume(Element e) =>
            (e.get_Parameter(BuiltInParameter.HOST_VOLUME_COMPUTED)?.AsDouble() ?? 0) * Ft3ToM3;

        private static StructuralAssetClass? AssetClass(Document doc, Material m)
        {
            if (m == null || m.StructuralAssetId == ElementId.InvalidElementId) return null;
            return (doc.GetElement(m.StructuralAssetId) as PropertySetElement)?.GetStructuralAsset()?.StructuralAssetClass;
        }

        private static bool IsConcrete(Document doc, Material m) =>
            m != null && (AssetClass(doc, m) == StructuralAssetClass.Concrete ||
                          ConcreteRe.IsMatch(m.Name) || ConcreteRe.IsMatch(m.MaterialClass ?? ""));

        private static bool IsSteel(Document doc, FamilyInstance fi)
        {
            if (fi.StructuralMaterialType == StructuralMaterialType.Steel) return true;
            if (fi.StructuralMaterialType == StructuralMaterialType.Concrete ||
                fi.StructuralMaterialType == StructuralMaterialType.PrecastConcrete) return false;
            var m = doc.GetElement(fi.StructuralMaterialId) as Material;
            return m != null && (AssetClass(doc, m) == StructuralAssetClass.Metal || SteelRe.IsMatch(m.Name));
        }

        /// Volume of the element's concrete, m3. Families that declare
        /// themselves concrete but carry no material fall back to their volume.
        private static double ConcreteVolume(Document doc, Element e)
        {
            double ft3 = e.GetMaterialIds(false)
                .Where(id => IsConcrete(doc, doc.GetElement(id) as Material))
                .Sum(id => e.GetMaterialVolume(id));
            if (ft3 > 0) return ft3 * Ft3ToM3;
            if (e is FamilyInstance fi && (fi.StructuralMaterialType == StructuralMaterialType.Concrete ||
                                           fi.StructuralMaterialType == StructuralMaterialType.PrecastConcrete))
                return Volume(e);
            return 0;
        }

        /// Formwork contact area, m2: vertical faces, plus downward faces when
        /// the member needs a soffit (beams, suspended slabs).
        private static double Formwork(Element e, bool soffit)
        {
            double ft2 = 0;
            foreach (Solid s in Solids(e.get_Geometry(new Options { ComputeReferences = false, DetailLevel = ViewDetailLevel.Fine })))
            {
                foreach (Face face in s.Faces)
                {
                    var bb = face.GetBoundingBox();
                    XYZ n = face.ComputeNormal((bb.Min + bb.Max) / 2);
                    if (Math.Abs(n.Z) < 0.2 || (soffit && n.Z < -0.8)) ft2 += face.Area;
                }
            }
            return ft2 * Ft2ToM2;
        }

        private static IEnumerable<Solid> Solids(GeometryElement geo)
        {
            if (geo == null) yield break;
            foreach (GeometryObject o in geo)
            {
                if (o is Solid s && s.Volume > 1e-6) yield return s;
                else if (o is GeometryInstance gi)
                    foreach (Solid inner in Solids(gi.GetInstanceGeometry())) yield return inner;
            }
        }

        /// Modelled rebar weight per host element, kg. Covers single bars and
        /// sets (Rebar) and area/path reinforcement bars (RebarInSystem).
        private static Dictionary<ElementId, double> RebarByHost(Document doc)
        {
            var kg = new Dictionary<ElementId, double>();
            foreach (Element e in Collect(doc, BuiltInCategory.OST_Rebar))
            {
                ElementId host = (e as Rebar)?.GetHostId() ?? (e as RebarInSystem)?.GetHostId();
                if (host == null || host == ElementId.InvalidElementId) continue;
                var bar = doc.GetElement(e.GetTypeId()) as RebarBarType;
                double lengthFt = e.get_Parameter(BuiltInParameter.REBAR_ELEM_TOTAL_LENGTH)?.AsDouble() ?? 0;
                if (bar == null || lengthFt <= 0) continue;
                double d = bar.BarNominalDiameter * FtToM;
                double w = Math.PI / 4 * d * d * lengthFt * FtToM * SteelKgPerM3;
                kg[host] = (kg.TryGetValue(host, out double prev) ? prev : 0) + w;
            }
            return kg;
        }
    }
}
