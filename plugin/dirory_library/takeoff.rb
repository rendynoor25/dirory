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
#
# "What is this?" - roles. Real models are mostly unnamed groups on Layer0,
# full of furniture, people, timber members and landscape, so direction alone
# over-counts. Every face gets a role, decided in this order:
#   1. the architect marked the face, or a group / component around it
#      ("Mark selection as ..."): attribute dirory_rab/role on the entity;
#   2. the model's mapping (attribute dirory_rab/mapping, JSON), by tag on the
#      path or by material: { "tags": { name: role }, "materials": { ... } };
#   3. automatic rules:
#        - furniture and entourage (by name or tag) are left out and counted;
#        - thin timber / steel members (a group or component whose box is
#          under 10 x 25 cm across and at least 4x as long), or a thin, mostly
#          open frame (a truss) are left out and reported as a frame;
#        - landscape materials (grass, gravel, pavers ...) facing up are site
#          work (hardscape / softscape), not floor;
#        - glass is glazing, not wall;
#        - horizontal strips narrower than 20 cm (wall tops and bottoms, beam
#          soffits), the underside of anything at ground level and raked
#          soffits with no material (the bare underside of a sloped roof)
#          are not finishes;
#        - anything else: by direction, as above.
# Roles: auto, wall, floor, ceiling, roof, landscape_hard, landscape_soft,
# glass, frame, ignore, door, window. `classes` lists what each material and
# tag was measured as, so the panel can show it and the architect can correct
# it; `excluded` says what was left out and why.

require 'json'

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
    # Indonesian drawing codes: P1, PJ-2 (pintu, pintu jendela), J3, BV1.
    OPENING_CODE_RE = /\A\s*(PJ|P|J|BV)\s*-?\s*\d+[A-Za-z]?\s*\z/i.freeze
    NO_MATERIAL = 'Unpainted'.freeze
    EXISTING_RE = /\b(existing|eksisting|exist|lama)\b/i.freeze
    DEMOLISH_RE = /\b(demolish\w*|demolition|bongkar\w*|dibongkar|pembongkaran)\b/i.freeze

    ATTR = 'dirory_rab'.freeze
    ROLES = %w[auto wall floor ceiling roof landscape_hard landscape_soft glass frame ignore door window].freeze
    SURFACES = %w[wall floor ceiling roof].freeze
    DEFAULT_TAGS = %w[Layer0 Untagged].freeze

    FURNITURE_RE = /\b(teddy|people|person|persons|silhouette|man|woman|men|women|child|kid|human|figure|orang|
                       bed|kasur|ranjang|sofa|couch|chair|kursi|stool|bench|table|meja|desk|credenza|cabinet|lemari|
                       wardrobe|drawer|shelf|shelves|rak|pillow|cushion|bantal|rug|carpet|karpet|curtain|gorden|
                       tv|television|refrigerator|fridge|kulkas|coffee|espresso|grinder|kettle|microwave|oven|
                       range|stove|burner|countertop|lamp|lampu|plant|pot|vase|tree|pohon|tanaman|flower|bunga|
                       book|books|car|mobil|motor|bicycle|sepeda|puff|pouf|poltrona|armchair|ottoman|knob|
                       handle|toilet|kloset|closet|sink|wastafel|basin|shower|bathtub|mirror|cermin|
                       decor|decoration|furniture|furn|mebel)\b/xi.freeze
    FURNITURE_TAG_RE = /(furn|furniture|built-?ins?|entourage|people|orang|mebel|interior|vegetation|plant|tree|
                         tanaman|pohon|car|mobil|decor)/xi.freeze
    GLASS_RE = /\b(glass|glazing|kaca)\b/i.freeze
    HARDSCAPE_RE = /\b(gravel|kerikil|rock|rocks|paver|pavers|paving|rabat|koral|cobble\w*|grass ?block|
                       grassblock|conblock|stepping)\b/xi.freeze
    SOFTSCAPE_RE = /\b(grass|rumput|lawn|turf|groundcover|ground ?cover|soil|tanah)\b/i.freeze

    MEMBER_THIN = 0.10      # m: a member is at most this thick ...
    MEMBER_WIDE = 0.25      # m: ... and this wide ...
    MEMBER_RATIO = 4.0      # ... and at least this many times as long as it is wide
    PANEL_THIN = 0.15       # m: a frame panel (a truss) is at most this thick
    PANEL_FILL = 0.45       # and its faces cover less than this share of its box
    STRIP_WIDTH = 0.20      # m: horizontal faces narrower than this are edges
    GROUND_BAND = 0.30      # m: undersides this close to the lowest point

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
      names = names.compact.map(&:to_s)
      names.each do |n|
        next unless (m = n.match(OPENING_CODE_RE))
        return m[1].casecmp('J').zero? || m[1].casecmp('BV').zero? ? 'window' : 'door'
      end
      text = names.join(' ')
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

    # Pure: the role a material's name implies, or 'auto'.
    def self.material_role(name)
      n = name.to_s
      return 'glass' if n =~ GLASS_RE
      return 'landscape_hard' if n =~ HARDSCAPE_RE
      return 'landscape_soft' if n =~ SOFTSCAPE_RE
      'auto'
    end

    # Pure: furniture or entourage, from a group's or component's names.
    def self.furniture?(names, tag)
      names.compact.any? { |n| n.to_s.tr('_', ' ') =~ FURNITURE_RE } ||
        (!tag.to_s.empty? && !DEFAULT_TAGS.include?(tag.to_s) && tag.to_s =~ FURNITURE_TAG_RE)
    end

    # Pure: 'member' (a linear timber/steel piece), 'panel' (a thin open
    # frame) or nil, from a box's three sides in metres and, for a panel,
    # how much of the box's surface its faces cover (0..1, nil = unknown).
    def self.frame_shape(dims, fill = nil)
      a, b, c = dims.sort
      return 'member' if a <= MEMBER_THIN && b <= MEMBER_WIDE && c >= MEMBER_RATIO * [b, 0.01].max
      return 'panel' if a <= PANEL_THIN && b >= 0.5 && fill && fill < PANEL_FILL
      nil
    end

    # Pure: the saved mapping from its JSON, cleaned to known roles.
    def self.parse_mapping(json)
      data = json.to_s.empty? ? {} : JSON.parse(json.to_s)
      clean = lambda do |h|
        (h.is_a?(Hash) ? h : {}).each_with_object({}) do |(k, v), out|
          out[k.to_s] = v.to_s if ROLES.include?(v.to_s) && v.to_s != 'auto'
        end
      end
      { 'materials' => clean.call(data['materials']), 'tags' => clean.call(data['tags']) }
    rescue JSON::ParserError
      { 'materials' => {}, 'tags' => {} }
    end

    def self.mapping(model)
      parse_mapping(model.get_attribute(ATTR, 'mapping'))
    end

    # Save the mapping (a Hash like parse_mapping's) on the model, undoable.
    def self.save_mapping(model, map)
      clean = parse_mapping(map.to_json)
      model.start_operation('Dirory: RAB Mapping', true)
      model.set_attribute(ATTR, 'mapping', clean.to_json)
      model.commit_operation
      clean
    end

    # Mark entities (the selection) with a role; 'auto' clears the mark.
    # Returns how many were marked.
    def self.mark(model, entities, role)
      return 0 unless ROLES.include?(role)
      n = 0
      model.start_operation('Dirory: mark as ' + role, true)
      entities.each do |e|
        next unless e.is_a?(Sketchup::Face) || e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
        if role == 'auto'
          e.delete_attribute(ATTR, 'role')
        else
          e.set_attribute(ATTR, 'role', role)
        end
        n += 1
      end
      model.commit_operation
      n
    end

    def self.user_role(entity)
      r = entity.get_attribute(ATTR, 'role').to_s
      ROLES.include?(r) && r != 'auto' ? r : nil
    end

    # The open model's takeoff. `info` returns Dirory's tag for a material or
    # definition (Library.dirory_info), or nil for anything else.
    def self.run(model, info)
      map = mapping(model)
      ctx = {
        info: info,
        map: map,
        ground_z: model.bounds.min.z,
        rows: {},             # [element, material] => row
        openings: {},         # definition name => row
        perimeter_in: 0.0,
        components_skipped: 0,
        demolition: {},       # [group, name, width] => row
        classes: {},          # [kind, name] => class
        landscape: {},        # [role, material] => row
        excluded_in2: Hash.new(0.0),
        furniture: Hash.new(0),
        other: Hash.new(0),
        marked: Hash.new(0),
        frame: { 'members' => 0, 'panels' => 0, 'length_m' => 0.0, 'volume_m3' => 0.0 },
        fill: {}
      }
      # The whole model is measured, not just the group open for editing.
      walk(model.entities, Geom::Transformation.new, nil, [], ctx, nil) # rubocop:disable SketchupSuggestions/ModelEntities

      rows = ctx[:rows].values.map do |r|
        r.merge('area_m2' => (r.delete('area_in2') * SQIN_TO_SQM).round(2))
      end
      rows.reject! { |r| r['area_m2'] <= 0 }
      order = %w[wall floor ceiling roof]
      rows.sort_by! { |r| [order.index(r['element']) || 9, -r['area_m2']] }

      totals = Hash.new(0.0)
      rows.each { |r| totals[r['element']] += r['area_m2'] }

      landscape = ctx[:landscape].values.map do |r|
        r.merge('area_m2' => (r.delete('area_in2') * SQIN_TO_SQM).round(2))
      end.reject { |r| r['area_m2'] <= 0 }.sort_by { |r| [r['role'], -r['area_m2']] }

      top = ->(h) { h.sort_by { |k, v| [-v, k] }.first(25).map { |k, v| { 'name' => k, 'count' => v } } }
      frame = ctx[:frame]
      {
        'rows' => rows,
        'totals' => totals.transform_values { |v| v.round(2) },
        'openings' => ctx[:openings].values.sort_by { |o| [o['kind'], o['name']] },
        'floor_perimeter_m' => (ctx[:perimeter_in] * IN_TO_M).round(2),
        'components_skipped' => ctx[:components_skipped],
        'demolition' => ctx[:demolition].values.map do |r|
          r.merge('quantity' => (r['unit'] == 'm2' ? r['quantity'] * SQIN_TO_SQM : r['quantity']).round(2))
        end,
        'landscape' => landscape,
        'classes' => classes_out(ctx),
        'excluded' => {
          'furniture' => { 'count' => ctx[:furniture].values.sum, 'names' => top.call(ctx[:furniture]) },
          'other_components' => { 'count' => ctx[:other].values.sum, 'names' => top.call(ctx[:other]) },
          'marked_ignore' => { 'count' => ctx[:marked].values.sum, 'names' => top.call(ctx[:marked]) },
          'frame' => frame.merge('length_m' => frame['length_m'].round(2), 'volume_m3' => frame['volume_m3'].round(3)),
          'area_m2' => ctx[:excluded_in2].transform_values { |v| (v * SQIN_TO_SQM).round(2) }
        },
        'mapping' => map
      }
    end

    def self.classes_out(ctx)
      ctx[:classes].values.map do |c|
        by = c['by'].transform_values { |v| (v * SQIN_TO_SQM).round(2) }.reject { |_k, v| v <= 0 }
        c.merge('by' => by, 'area_m2' => by.values.sum.round(2))
      end.reject { |c| c['area_m2'] <= 0 }.sort_by { |c| [c['kind'] == 'tag' ? 0 : 1, -c['area_m2']] }.first(300)
    end

    def self.visible?(entity)
      return false if entity.respond_to?(:hidden?) && entity.hidden?
      layer = entity.respond_to?(:layer) ? entity.layer : nil
      !(layer && layer.respond_to?(:visible?) && !layer.visible?)
    end

    # `forced` is the role the architect gave an enclosing group/component.
    def self.walk(entities, transform, inherited, tags, ctx, forced)
      entities.each do |e|
        next unless visible?(e)
        case e
        when Sketchup::Face
          measure_face(e, transform, inherited, tags + [e.layer.name], ctx, forced)
        when Sketchup::Group, Sketchup::ComponentInstance
          container(e, transform, inherited, tags + [e.layer.name], ctx, forced)
        end
      end
    end

    # The role of a group/component: [role, 'user' | 'auto'], or nil to decide
    # per face. Precedence as in the header.
    def self.container_role(e, tags, ctx, forced)
      own = user_role(e)
      return [own, 'user'] if own
      return forced if forced
      tags.reverse_each do |t|
        r = ctx[:map]['tags'][t]
        return [r, 'user'] if r
      end
      nil
    end

    def self.container(e, transform, inherited, tags, ctx, forced)
      t = transform * e.transformation
      defn = e.definition
      group = e.is_a?(Sketchup::Group)
      role, source = container_role(e, tags, ctx, forced)
      label = group ? e.name.to_s : defn.name.to_s

      unless role
        phase = phase_of(tags)
        return if phase == 'existing'
        tag = group ? nil : ctx[:info].call(defn)
        kind = group ? opening_kind(e.name) : opening_kind(defn.name, e.name, e.layer.name, tag && tag['category'], tag && tag['name'])
        if %w[door window].include?(kind) || (!group && (kind == 'frame' || phase == 'demolish'))
          return count_opening(e, kind, t, tags, ctx, tag)
        end
        if !tag && furniture?([label, group ? nil : e.name], e.layer.name)
          ctx[:furniture][label.empty? ? '(group)' : label] += 1
          ctx[:components_skipped] += 1 unless group
          return
        end
        frame = tag ? nil : frame_candidate?(defn, t, ctx)
        return add_frame(ctx, *frame) if frame
        return walk(defn.entities, t, e.material || inherited, tags, ctx, nil) if group
        ctx[:other][label] += 1
        ctx[:components_skipped] += 1
        return
      end

      case role
      when 'ignore'
        ctx[:marked][label.empty? ? '(group)' : label] += 1
      when 'frame'
        dims = world_dims(defn.bounds, t)
        add_frame(ctx, frame_shape(dims, 0) || 'member', dims)
      when 'door', 'window'
        count_opening(e, role, t, tags, ctx, group ? nil : ctx[:info].call(defn))
      else
        walk(defn.entities, t, e.material || inherited, tags, ctx, [role, source])
      end
    end

    # Is this group/component a frame member or a frame panel? Returns the
    # shape and its world box (for length and volume), or nil.
    def self.frame_candidate?(defn, transform, ctx)
      dims = world_dims(defn.bounds, transform)
      a, b, = dims.sort
      return nil if a > PANEL_THIN
      shape = frame_shape(dims)
      if shape.nil? && a <= PANEL_THIN
        area = (ctx[:fill][[defn.entityID, dims.map { |d| d.round(2) }]] ||= surface_m2(defn.entities, transform))
        sa, sb, sc = dims
        box = 2 * (sa * sb + sb * sc + sc * sa)
        shape = frame_shape(dims, box > 0 ? area / box : nil)
      end
      shape ? [shape, dims] : nil
    end

    def self.add_frame(ctx, shape, dims)
      if shape == 'panel'
        ctx[:frame]['panels'] += 1
      else
        a, b, c = dims.sort
        ctx[:frame]['members'] += 1
        ctx[:frame]['length_m'] += c
        ctx[:frame]['volume_m3'] += a * b * c
      end
    end

    # Face area (m2) of everything inside, nested groups and components too.
    def self.surface_m2(entities, transform, depth = 0)
      total = 0.0
      entities.each do |e|
        case e
        when Sketchup::Face
          total += face_area(e, transform) * SQIN_TO_SQM
        when Sketchup::Group, Sketchup::ComponentInstance
          total += surface_m2(e.definition.entities, transform * e.transformation, depth + 1) if depth < 8
        end
      end
      total
    end

    def self.face_area(face, transform)
      face.area(transform)
    rescue StandardError
      face.area
    end

    # The role of one face: [role, source].
    def self.face_role(face, mat_name, tags, ctx, forced)
      own = user_role(face)
      return [own, 'user'] if own
      return forced if forced
      tags.reverse_each do |t|
        r = ctx[:map]['tags'][t]
        return [r, 'user'] if r
      end
      r = ctx[:map]['materials'][mat_name]
      return [r, 'user'] if r
      [material_role(mat_name), 'auto']
    end

    def self.measure_face(face, transform, inherited, tags, ctx, forced)
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
      area = face_area(face, transform)
      role, source = face_role(face, mat_name, tags, ctx, forced)

      bucket =
        case role
        when 'auto'
          auto_bucket(face, transform, normal, element, mat_name, ctx) || element
        when *SURFACES then role
        when 'landscape_hard', 'landscape_soft'
          normal.z >= VERTICAL_TOL ? role : 'landscape_edge'
        when 'glass' then 'glass'
        else 'ignore'
        end
      record_class(ctx, mat_name, tags, role, source, bucket, area)

      unless SURFACES.include?(bucket) || bucket.start_with?('landscape_') && bucket != 'landscape_edge'
        ctx[:excluded_in2][bucket] += area
        return
      end

      if phase == 'demolish'
        demolish(ctx, bucket == 'wall' ? 'wall_area' : bucket, mat_name, 'm2', area)
        return
      end

      if bucket.start_with?('landscape_')
        row = ctx[:landscape][[bucket, mat_name]] ||= { 'role' => bucket, 'material' => mat_name, 'area_in2' => 0.0 }
        row['area_in2'] += area
        return
      end

      key = [bucket, mat_name]
      row = ctx[:rows][key] ||= begin
        tag = material ? ctx[:info].call(material) : nil
        {
          'element' => bucket,
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
      row['area_in2'] += area

      return unless bucket == 'floor'
      # Skirting runs where the floor meets a wall: edges shared with a
      # vertical face (in the same group) that rises above the floor - not a
      # slab edge, which hangs below it.
      face.outer_loop.edges.each do |edge|
        a = edge.start.position.transform(transform)
        b = edge.end.position.transform(transform)
        top = [a.z, b.z].max + 0.05 / IN_TO_M
        next unless edge.faces.any? do |f|
          f != face && f.normal.transform(transform).normalize.z.abs < VERTICAL_TOL &&
            f.vertices.any? { |v| v.position.transform(transform).z > top }
        end
        ctx[:perimeter_in] += a.distance(b)
      end
    end

    # Geometry rules for a face with no role: an excluded reason, or nil.
    def self.auto_bucket(face, transform, normal, element, mat_name, ctx)
      return nil if element == 'wall'
      if element == 'ceiling'
        # A raked soffit with a finish (multiplek, lambersering) is a ceiling;
        # bare, it is just the underside of the roof.
        return 'soffit' if normal.z > -HORIZONTAL_TOL && mat_name == NO_MATERIAL
        low = face.vertices.map { |v| v.position.transform(transform).z }.min
        return 'underside' if (low - ctx[:ground_z]) * IN_TO_M < GROUND_BAND
      end
      return nil unless normal.z.abs >= HORIZONTAL_TOL
      pts = face.outer_loop.vertices.map { |v| v.position.transform(transform) }
      length = pts.each_with_index.sum { |p, i| p.distance(pts[i - 1]) }
      return nil if length <= 0
      width = face_area(face, transform) / (length / 2.0) * IN_TO_M
      width < STRIP_WIDTH ? 'edge' : nil
    end

    def self.record_class(ctx, mat_name, tags, role, source, bucket, area)
      mrole = ctx[:map]['materials'][mat_name]
      add = lambda do |kind, name, crole, csource|
        c = ctx[:classes][[kind, name]] ||= { 'kind' => kind, 'name' => name, 'role' => crole, 'source' => csource, 'by' => Hash.new(0.0) }
        c['by'][bucket] += area
      end
      add.call('material', mat_name, mrole || material_role(mat_name), mrole ? 'user' : 'auto')
      tag = tags.reverse.find { |t| !DEFAULT_TAGS.include?(t.to_s) }
      return unless tag
      trole = ctx[:map]['tags'][tag]
      add.call('tag', tag, trole || 'auto', trole ? 'user' : 'auto')
    end

    # A demolished element, grouped by what it is and its name.
    def self.demolish(ctx, group, name, unit, quantity, width = 0.0)
      key = [group, name, width.round(2)]
      row = ctx[:demolition][key] ||= {
        'group' => group, 'name' => name, 'unit' => unit, 'quantity' => 0.0, 'width_m' => width.round(2)
      }
      row['quantity'] += quantity
    end

    # A door, window or kusen (or, being demolished, any component).
    def self.count_opening(inst, kind, transform, tags, ctx, tag)
      defn = inst.definition
      name = inst.is_a?(Sketchup::Group) && !inst.name.to_s.empty? ? inst.name : defn.name
      if phase_of(tags) == 'demolish'
        width, = world_size(defn.bounds, transform)
        if %w[door window].include?(kind)
          demolish(ctx, kind, name, 'unit', 1, width)
        else
          demolish(ctx, 'component', [name, tag && tag['category']].compact.join(' '), 'unit', 1)
        end
        return
      end
      width, height = world_size(defn.bounds, transform)
      label = tag ? tag['name'] : name
      # Same definition at a different scale is a different size of opening.
      key = format('%s|%.0fx%.0f', name, width * 100, height * 100)
      row = ctx[:openings][key] ||= {
        'kind' => kind,
        'name' => label,
        'brand' => tag ? tag['brand'] : '',
        'sku' => tag ? tag['sku'] : '',
        'width_m' => width.round(2),
        'height_m' => height.round(2),
        'count' => 0
      }
      row['count'] += 1
    end

    # The three sides of a bounding box placed in the world, in metres.
    def self.world_dims(bounds, transform)
      pts = (0..7).map { |i| bounds.corner(i).transform(transform) }
      [pts.map(&:x), pts.map(&:y), pts.map(&:z)].map { |vs| (vs.max - vs.min) * IN_TO_M }
    end

    # Width (the larger horizontal side) and height of a bounding box placed
    # in the world, in metres.
    def self.world_size(bounds, transform)
      x, y, z = world_dims(bounds, transform)
      [[x, y].max, z]
    end
  end
end
