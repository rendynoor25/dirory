// MEP quantities from Revit elements, for the MEP section of the RAB.
//
// What is measured, grouped by type:
//   pipe       length (m) per system classification, material and nominal
//              diameter (mm). Fittings are not counted: the AHSP pipe items
//              already include fittings and accessories.
//   duct       outer surface area (m2) per duct type and size
//   cable_tray length (m)
//   counted    plumbing fixtures, light fittings, switches, sockets, panels,
//              mechanical equipment, air terminals, sprinklers, fire alarm
//              devices: number placed per family and type
//
// Which priced item a row becomes is decided in rab.js (mepKey), from the
// names here, so the rules can be tested without Revit and shared with any
// other host. Rows it cannot match are listed for the architect to price.

using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Dirory.Revit
{
    public static class MepTakeoff
    {
        private const double FtToM = 0.3048;
        private const double Ft2ToM2 = 0.09290304;

        private static readonly (BuiltInCategory cat, string group)[] Counted =
        {
            (BuiltInCategory.OST_PlumbingFixtures, "plumbing_fixture"),
            (BuiltInCategory.OST_LightingFixtures, "light"),
            (BuiltInCategory.OST_LightingDevices, "switch"),
            (BuiltInCategory.OST_ElectricalFixtures, "socket"),
            (BuiltInCategory.OST_ElectricalEquipment, "panel"),
            (BuiltInCategory.OST_MechanicalEquipment, "equipment"),
            (BuiltInCategory.OST_DuctTerminal, "air_terminal"),
            (BuiltInCategory.OST_Sprinklers, "sprinkler"),
            (BuiltInCategory.OST_FireAlarmDevices, "fire_alarm"),
        };

        /// New construction in the priced phase; demolished elements go to `ph`.
        public static List<Dictionary<string, object>> Run(Document doc, Phasing ph)
        {
            var rows = new Dictionary<string, Dictionary<string, object>>();
            void Add(Element e, string group, string name, string system, string material, double sizeMm, string unit, double qty)
            {
                if (qty <= 0) return;
                string status = ph.Status(e);
                if (status == "demolished") ph.Demolish(group, name, unit, qty);
                if (status != "new") return;
                string key = string.Join("|", group, name, system, material, sizeMm.ToString("0"));
                if (!rows.TryGetValue(key, out var row))
                {
                    row = new Dictionary<string, object>
                    {
                        ["group"] = group, ["name"] = name, ["system"] = system, ["material"] = material,
                        ["size_mm"] = Math.Round(sizeMm), ["unit"] = unit, ["quantity"] = 0.0,
                    };
                    rows[key] = row;
                }
                row["quantity"] = (double)row["quantity"] + qty;
            }

            foreach (Element p in Collect(doc, BuiltInCategory.OST_PipeCurves))
            {
                string material = string.Join(" ", new[]
                {
                    p.get_Parameter(BuiltInParameter.RBS_PIPE_MATERIAL_PARAM)?.AsValueString(),
                    p.get_Parameter(BuiltInParameter.RBS_PIPE_SEGMENT_PARAM)?.AsValueString(),
                }.Where(s => !string.IsNullOrWhiteSpace(s)));
                Add(p, "pipe", TypeName(doc, p),
                    p.get_Parameter(BuiltInParameter.RBS_SYSTEM_CLASSIFICATION_PARAM)?.AsString() ?? "",
                    material,
                    (p.get_Parameter(BuiltInParameter.RBS_PIPE_DIAMETER_PARAM)?.AsDouble() ?? 0) * FtToM * 1000,
                    "m", Length(p));
            }

            foreach (Element d in Collect(doc, BuiltInCategory.OST_DuctCurves))
            {
                string size = d.get_Parameter(BuiltInParameter.RBS_CALCULATED_SIZE)?.AsString() ?? "";
                Add(d, "duct", TypeName(doc, d) + (size != "" ? " " + size : ""),
                    d.get_Parameter(BuiltInParameter.RBS_SYSTEM_CLASSIFICATION_PARAM)?.AsString() ?? "", "", 0,
                    "m2", (d.get_Parameter(BuiltInParameter.RBS_CURVE_SURFACE_AREA)?.AsDouble() ?? 0) * Ft2ToM2);
            }

            foreach (Element t in Collect(doc, BuiltInCategory.OST_CableTray))
                Add(t, "cable_tray", TypeName(doc, t), "", "", 0, "m", Length(t));

            foreach (var (cat, group) in Counted)
                foreach (Element e in Collect(doc, cat).OfType<FamilyInstance>())
                    Add(e, group, TypeName(doc, e), "", "", 0, "unit", 1);

            return rows.Values.Select(r =>
            {
                r["quantity"] = Math.Round((double)r["quantity"], 2);
                return r;
            })
            .OrderBy(r => (string)r["group"]).ThenBy(r => (string)r["system"])
            .ThenBy(r => (double)r["size_mm"]).ThenBy(r => (string)r["name"]).ToList();
        }

        private static IEnumerable<Element> Collect(Document doc, BuiltInCategory cat) =>
            new FilteredElementCollector(doc).OfCategory(cat).WhereElementIsNotElementType();

        private static double Length(Element e) =>
            (e.get_Parameter(BuiltInParameter.CURVE_ELEM_LENGTH)?.AsDouble() ?? 0) * FtToM;

        private static string TypeName(Document doc, Element e)
        {
            var t = doc.GetElement(e.GetTypeId()) as ElementType;
            if (t == null) return e.Name;
            return string.IsNullOrEmpty(t.FamilyName) || t.FamilyName == t.Name ? t.Name : t.FamilyName + " : " + t.Name;
        }
    }
}
