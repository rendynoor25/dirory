# Dirory - quantity takeoff (step 1 of the RAB / Bill of Quantities feature)
#
# Measures the architecture of the open model the way an Indonesian RAB needs
# it: wall, floor, ceiling and roof finish areas per material, door and window
# counts with their sizes, and the floor perimeter for skirting. Nothing here
# prices anything; the volumes are what AHSP coefficients and local unit
# prices (HSD) will be applied to in step 2.
#
# What is measured, and what is not:
#   * Faces in the model itself and inside Groups. Walls, slabs and roofs are
#     drawn that way in practice.
#   * Faces inside Components are NOT measured: components are furniture,
#     fixtures and Dirory products, whose faces would otherwise be counted as
#     walls and floors. Doors and windows are components, and are counted as
#     units instead.
#   * Hidden entities and hidden tags are skipped.
#   * A face is classified by the direction it faces in world space:
#       vertical (within ~10 deg)  -> wall      (each side is its own face, so
#                                               this is the FINISH area: paint,
#                                               plaster, tiles per side)
#       facing up (within ~10 deg) -> floor, or roof when its tag says so
#       facing down                -> ceiling
#       sloped, facing up          -> roof      (true area, slope included)
#       sloped, facing down        -> ceiling   (a raked soffit)
#     Tags are only used for flat roofs: "Lantai 1" in Indonesian practice
#     names a storey, not a floor finish, so tags never decide floor vs wall.
#   * Openings are subtracted for free: SketchUp faces already have their
#     holes cut out.
#   * Phases, by tag (SketchUp has no phasing): anything on a tag - or inside
#     a group or component on a tag - named "Existing" / "Eksisting" / "Lama"
#     is already built and is not measured; "Demolish" / "Bongkar" is listed
#     under `demolition` instead, for the RAB's pembongkaran section.

module Dirory
  module Takeoff
    SQIN_TO_SQM = 0.00064516
    IN_TO_M = 0.0254
    VERTICAL_TOL = 0.17     # |normal.z| below this: vertical within ~10 deg
    HORIZONTAL_TOL = 0.985  # |normal.z| above this: horizontal within ~10 deg
    ROOF_TAG_RE = /\b(roof|atap)\b/i.freeze
    DOOR_RE = /\b(door|pintu)\b/i.freeze
    WINDOW_RE = /\b(window|jendela|bouvenlicht|bovenlicht|ventilasi)\b/i.freeze
    FRAME_RE = /\bkusen\b/i.freeze
    NO_MATERIAL = 'Unpainted'.freeze
    EXISTING_RE = /\b(existing|eksisting|exist|lama)\b/i.freeze
    DEMOLISH_RE = /\b(demolish\w*|demolition|bongkar\w*|dibongkar|pembongkaran)\b/i.freeze

    # Pure: the element a face belongs to, from the z of its world-space unit
    # normal and the tag names on its path (outermost first).
    def self.classify(nz, tags = [])
      return 'wall' if nz.abs < VERTICAL_TOL
      if nz >= HORIZONTAL_TOL
        return tags.any? { |t| t.to_s =~ ROOF_TAG_RE } ? 'roof' : 'floor'
      end
      return 'ceiling' if nz <= -HORIZONTAL_TOL
      nz > 0 ? 'roof' : 'ceiling'
    end

    # Pure: door / window / frame from any of the names that describe a
    # component (definition, instance, tag, Dirory category). nil = not one.
    def self.opening_kind(*names)
      text = names.compact.map(&:to_s).join(' ')
      return 'door' if text =~ DOOR_RE
      return 'window' if text =~ WINDOW_RE
      return 'frame' if text =~ FRAME_RE
      nil
    end

    # Pure: 'new', 'existing' or 'demolish' from the tag names on a path.
    def self.phase_of(tags)
      text = tags.compact.map(&:to_s).join(' ')
      return 'demolish' if text =~ DEMOLISH_RE
      return 'existing' if text =~ EXISTING_RE
      'new'
    end

    # The open model's takeoff. `info` returns Dirory's tag for a material or
    # definition (Library.dirory_info), or nil for anything else.
    def self.run(model, info)
      ctx = {
        info: info,
        rows: {},             # [element, material] => row
        openings: {},         # definition name => row
        perimeter_in: 0.0,
        components_skipped: 0,
        demolition: {}        # [group, name, width] => row
      }
      walk(model.entities, Geom::Transformation.new, nil, [], ctx)

      rows = ctx[:rows].values.map do |r|
        r.merge('area_m2' => (r.delete('area_in2') * SQIN_TO_SQM).round(2))
      end
      rows.reject! { |r| r['area_m2'] <= 0 }
      order = %w[wall floor ceiling roof]
      rows.sort_by! { |r| [order.index(r['element']) || 9, -r['area_m2']] }

      totals = Hash.new(0.0)
      rows.each { |r| totals[r['element']] += r['area_m2'] }

      {
        'rows' => rows,
        'totals' => totals.transform_values { |v| v.round(2) },
        'openings' => ctx[:openings].values.sort_by { |o| [o['kind'], o['name']] },
        'floor_perimeter_m' => (ctx[:perimeter_in] * IN_TO_M).round(2),
        'components_skipped' => ctx[:components_skipped],
        'demolition' => ctx[:demolition].values.map do |r|
          r.merge('quantity' => (r['unit'] == 'm2' ? r['quantity'] * SQIN_TO_SQM : r['quantity']).round(2))
        end
      }
    end

    def self.visible?(entity)
      return false if entity.respond_to?(:hidden?) && entity.hidden?
      layer = entity.respond_to?(:layer) ? entity.layer : nil
      !(layer && layer.respond_to?(:visible?) && !layer.visible?)
    end

    def self.walk(entities, transform, inherited, tags, ctx)
      entities.each do |e|
        next unless visible?(e)
        case e
        when Sketchup::Face
          measure_face(e, transform, inherited, tags + [e.layer.name], ctx)
        when Sketchup::Group
          walk(e.definition.entities, transform * e.transformation,
               e.material || inherited, tags + [e.layer.name], ctx)
        when Sketchup::ComponentInstance
          count_component(e, transform, tags + [e.layer.name], ctx)
        end
      end
    end

    def self.measure_face(face, transform, inherited, tags, ctx)
      normal = face.normal.transform(transform)
      return if normal.length.zero?
      normal.normalize!
      element = classify(normal.z, tags)
      phase = phase_of(tags)
      return if phase == 'existing'

      # The painted side: front, or the back when only the back is painted
      # (a reversed face), or whatever the enclosing group carries.
      material = face.material || face.back_material || inherited
      mat_name = material ? material.display_name.to_s : NO_MATERIAL
      if phase == 'demolish'
        area = begin
          face.area(transform)
        rescue StandardError
          face.area
        end
        demolish(ctx, element == 'wall' ? 'wall_area' : element, mat_name, 'm2', area)
        return
      end
      key = [element, mat_name]
      row = ctx[:rows][key] ||= begin
        tag = material ? ctx[:info].call(material) : nil
        {
          'element' => element,
          'material' => tag ? tag['name'] : mat_name,
          'brand' => tag ? tag['brand'] : '',
          'sku' => tag ? tag['sku'] : '',
          'category' => tag ? tag['category'] : '',
          'tile_size' => tag ? tag['tile_size'] : '',
          'dirory' => !tag.nil?,
          'faces' => 0,
          'area_in2' => 0.0
        }
      end
      row['faces'] += 1
      row['area_in2'] += begin
        face.area(transform)
      rescue StandardError
        face.area
      end

      return unless element == 'floor'
      face.outer_loop.edges.each do |edge|
        a = edge.start.position.transform(transform)
        b = edge.end.position.transform(transform)
        ctx[:perimeter_in] += a.distance(b)
      end
    end

    # A demolished element, grouped by what it is and its name.
    def self.demolish(ctx, group, name, unit, quantity, width = 0.0)
      key = [group, name, width.round(2)]
      row = ctx[:demolition][key] ||= {
        'group' => group, 'name' => name, 'unit' => unit, 'quantity' => 0.0, 'width_m' => width.round(2)
      }
      row['quantity'] += quantity
    end

    def self.count_component(inst, transform, tags, ctx)
      phase = phase_of(tags)
      return if phase == 'existing'
      defn = inst.definition
      tag = ctx[:info].call(defn)
      kind = opening_kind(defn.name, inst.name, inst.layer.name, tag && tag['category'], tag && tag['name'])
      if phase == 'demolish'
        width, = world_size(defn.bounds, transform * inst.transformation)
        if %w[door window].include?(kind)
          demolish(ctx, kind, defn.name, 'unit', 1, width)
        else
          demolish(ctx, 'component', [defn.name, tag && tag['category']].compact.join(' '), 'unit', 1)
        end
        return
      end
      unless kind
        ctx[:components_skipped] += 1
        return
      end
      width, height = world_size(defn.bounds, transform * inst.transformation)
      name = tag ? tag['name'] : defn.name
      # Same definition at a different scale is a different size of opening.
      key = format('%s|%.0fx%.0f', defn.name, width * 100, height * 100)
      row = ctx[:openings][key] ||= {
        'kind' => kind,
        'name' => name,
        'brand' => tag ? tag['brand'] : '',
        'sku' => tag ? tag['sku'] : '',
        'width_m' => width.round(2),
        'height_m' => height.round(2),
        'count' => 0
      }
      row['count'] += 1
    end

    # Width (the larger horizontal side) and height of a bounding box placed
    # in the world, in metres.
    def self.world_size(bounds, transform)
      pts = (0..7).map { |i| bounds.corner(i).transform(transform) }
      xs = pts.map(&:x)
      ys = pts.map(&:y)
      zs = pts.map(&:z)
      w = [xs.max - xs.min, ys.max - ys.min].max * IN_TO_M
      h = (zs.max - zs.min) * IN_TO_M
      [w, h]
    end
  end
end
