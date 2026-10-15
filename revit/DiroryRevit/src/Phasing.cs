// Revit phasing for the takeoff. The RAB prices one phase - by default the
// project's last one ("New Construction"):
//   New, Temporary, no phase   counted as construction
//   Existing                   not counted: it is already there
//   Demolished                 counted as demolition (pembongkaran)
//   Past, Future, not created  not counted
// Each measurer (Takeoff, StructureTakeoff, MepTakeoff) asks Status() and
// hands demolished elements to Demolish(); rab.js prices them (demoKey).

using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Dirory.Revit
{
    public sealed class Phasing
    {
        public ElementId PhaseId { get; }
        public string PhaseName { get; }
        private readonly Dictionary<string, Dictionary<string, object>> _demolished = new Dictionary<string, Dictionary<string, object>>();

        private Phasing(ElementId id, string name)
        {
            PhaseId = id;
            PhaseName = name;
        }

        /// The requested phase (its id as text), or the project's last phase.
        public static Phasing For(Document doc, string requestedId)
        {
            var phases = Phases(doc);
            if (phases.Count == 0) return new Phasing(ElementId.InvalidElementId, "");
            var pick = phases.FirstOrDefault(p => p.Id.Value.ToString() == requestedId) ?? phases.Last();
            return new Phasing(pick.Id, pick.Name);
        }

        public static List<Phase> Phases(Document doc) => doc.Phases.Cast<Phase>().ToList();

        public static List<Dictionary<string, object>> List(Document doc) =>
            Phases(doc).Select(p => new Dictionary<string, object> { ["id"] = p.Id.Value.ToString(), ["name"] = p.Name }).ToList();

        /// "new", "existing", "demolished" or "skip" for this phase.
        public string Status(Element e)
        {
            if (PhaseId == ElementId.InvalidElementId) return "new";
            ElementOnPhaseStatus s;
            try { s = e.GetPhaseStatus(PhaseId); }
            catch (Exception) { return "new"; }
            switch (s)
            {
                case ElementOnPhaseStatus.New:
                case ElementOnPhaseStatus.Temporary:
                case ElementOnPhaseStatus.None:
                    return "new";
                case ElementOnPhaseStatus.Existing:
                    return "existing";
                case ElementOnPhaseStatus.Demolished:
                    return "demolished";
                default:
                    return "skip";
            }
        }

        public bool IsNew(Element e) => Status(e) == "new";

        /// Record a demolished element: group (masonry, concrete, floor, ceiling,
        /// roof, door, window, or an MEP group), its type, unit and quantity.
        public void Demolish(string group, string name, string unit, double quantity, double widthM = 0)
        {
            if (quantity <= 0) return;
            string key = group + "|" + name + "|" + Math.Round(widthM, 2);
            if (!_demolished.TryGetValue(key, out var row))
            {
                row = new Dictionary<string, object>
                {
                    ["group"] = group, ["name"] = name, ["unit"] = unit, ["quantity"] = 0.0,
                    ["width_m"] = Math.Round(widthM, 2),
                };
                _demolished[key] = row;
            }
            row["quantity"] = (double)row["quantity"] + quantity;
        }

        public List<Dictionary<string, object>> Demolished() => _demolished.Values
            .Select(r => { r["quantity"] = Math.Round((double)r["quantity"], 2); return r; })
            .OrderBy(r => (string)r["group"]).ThenBy(r => (string)r["name"]).ToList();
    }
}
