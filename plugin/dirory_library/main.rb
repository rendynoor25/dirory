require 'sketchup.rb'
require 'json'
require 'digest'
require 'uri'
require 'fileutils'
require File.join(File.dirname(__FILE__), 'cloud')

if RUBY_PLATFORM =~ /mswin|mingw/i
  begin
    require 'fiddle/import'
    module DiroryBusyCursorApi
      extend Fiddle::Importer
      dlload 'user32.dll'
      extern 'void* LoadCursorA(void*, void*)'
      extern 'void* SetCursor(void*)'
    end
  rescue StandardError
    # Dirory still works if the host blocks optional native cursor access.
  end
end

module Dirory
  module Library
    PLUGIN_ROOT = File.dirname(__FILE__) unless defined?(PLUGIN_ROOT)

    SETTINGS_SECTION = 'DiroryLibrary'.freeze

    # v0.5.2 / UU 27/2022: where the "See exactly what is sent" panel links.
    # Kept as one constant so the product can be renamed without touching code.
    PRIVACY_URL = 'https://dirory.id/privacy'.freeze

    # Items with no brand folder are Dirory's own free samples.
    DIRORY_BRAND = 'Dirory'.freeze

    def self.sample_brand?(brand)
      brand.to_s.strip.casecmp?(DIRORY_BRAND)
    end

    # ------------------------------------------------------------------
    # Settings: where the local "database" folder lives.
    # ------------------------------------------------------------------
    def self.library_path
      default = File.join(Dir.home, 'Dirory')
      Sketchup.read_default(SETTINGS_SECTION, 'path', default)
    end

    def self.library_path=(path)
      Sketchup.write_default(SETTINGS_SECTION, 'path', path)
    end

    # ------------------------------------------------------------------
    # Auto-generated thumbnails for zero-config .skp files live in a
    # hidden cache folder inside the library, keyed by the model's full
    # path so renames of the library folder itself don't break anything.
    # ------------------------------------------------------------------
    def self.thumbnail_cache_dir
      dir = File.join(library_path, '.dirory_thumbnails')
      FileUtils.mkdir_p(dir)
      dir
    end

    def self.cached_thumbnail_path(skp_path)
      key = Digest::MD5.hexdigest(File.expand_path(skp_path))
      File.join(thumbnail_cache_dir, "#{key}.png")
    end

    # ------------------------------------------------------------------
    # Scanning the local library.
    #
    # Models and materials are discovered from their file extensions:
    #
    # 1) Zero-config: any .skp file anywhere under the library root is
    #    picked up automatically as a model. Its filename becomes its
    #    name, and its parent folder becomes its category. This is what
    #    matches a folder you just dropped existing .skp files into,
    #    e.g.:
    #      Dirory/
    #        Doors/
    #        Materials/
    #        CE9.skp
    #        CW 630 PJ.skp
    #
    # 2) Optional meta.json in a product folder can control display
    #    name, category, brand, thumbnail, and tags:
    #      DiroryLibrary/
    #        Doors/
    #          Panel Door A/
    #            meta.json     {"name":"Panel Door A","type":"model","tags":["door","wood"]}
    #            model.skp
    #            thumbnail.png
    #
    # 3) Every JPG/JPEG/PNG below a folder named "Materials" becomes an
    #    individual material card; its image is also its texture map.
    #
    # This is the ONLY method that needs to change when the database
    # moves to Supabase/Firebase — it just needs to keep returning an
    # array of hashes shaped like the ones below. The panel and the
    # insert/apply logic downstream don't care where the data came from.
    # ------------------------------------------------------------------
    IMAGE_EXTENSIONS = %w[.jpg .jpeg .png].freeze

    def self.read_meta(directory)
      path = File.join(directory, 'meta.json')
      return {} unless File.file?(path)
      JSON.parse(File.read(path))
    rescue StandardError
      {}
    end

    def self.image_files(directory)
      Dir.glob(File.join(directory, '*')).select do |path|
        File.file?(path) && IMAGE_EXTENSIONS.include?(File.extname(path).downcase)
      end
    end

    def self.sidecar_thumbnail(skp_path, meta = {})
      directory = File.dirname(skp_path)
      explicit = meta['thumbnail']
      if explicit && !explicit.to_s.empty?
        candidate = File.expand_path(explicit.to_s, directory)
        return candidate if File.file?(candidate)
      end
      base = File.basename(skp_path, File.extname(skp_path))
      same_name = IMAGE_EXTENSIONS.map { |ext| File.join(directory, base + ext) }
      candidates = same_name + Dir.glob(File.join(directory, 'thumbnail.*'))
      exact = candidates.find { |path| File.file?(path) && IMAGE_EXTENSIONS.include?(File.extname(path).downcase) }
      return exact if exact

      model_key = base.downcase.gsub(/[^a-z0-9]/, '')
      matches = image_files(directory).select do |image|
        image_key = File.basename(image, File.extname(image)).downcase.gsub(/[^a-z0-9]/, '')
        !image_key.empty? && (model_key.include?(image_key) || image_key.include?(model_key))
      end
      return matches.first if matches.length == 1

      # If a directory has exactly one model and one image, their pairing is clear.
      matches = image_files(directory)
      matches.first if Dir.glob(File.join(directory, '*.skp')).length == 1 && matches.length == 1
    end

    # Folder layout (singular or plural folder names both work):
    #
    #   <library>/Model/<Category>/<Brand>/<file>.skp
    #   <library>/Material/<Category>/<Brand>/<image>.jpg
    #
    # Category = the folder right under Model/Material.
    # Brand    = the folder that directly holds the file.
    # If a file sits straight inside its category folder, it has no brand.
    MODEL_FOLDER_NAMES = %w[model models].freeze
    MATERIAL_FOLDER_NAMES = %w[material materials].freeze

    def self.relative_parts(path, root)
      normalized = File.expand_path(path).tr('\\', '/')
      root_normalized = File.expand_path(root).tr('\\', '/')
      normalized.sub(/\A#{Regexp.escape(root_normalized)}\/?/i, '').split('/')
    end

    def self.category_brand_for(path, root, folder_names)
      parts = relative_parts(path, root)
      marker = parts.index { |part| folder_names.include?(part.downcase) }
      parts = parts[(marker + 1)..-1] if marker
      folders = parts[0...-1] || []
      category = folders[0] || 'Uncategorized'
      brand = folders.length > 1 ? folders[-1] : ''
      [category, brand]
    end

    # Walk the directory tree once, showing every model and every image under
    # a Materials folder. A metadata file can add tags/name/category/brand,
    # but never hides extra SKP or image files in that folder.
    def self.scan_library
      root = library_path
      return [] unless Dir.exist?(root)
      items = []
      metadata = {}
      Dir.glob(File.join(root, '**', 'meta.json')).each do |meta_path|
        metadata[File.dirname(meta_path)] = read_meta(File.dirname(meta_path))
      end

      Dir.glob(File.join(root, '**', '*.skp')).each do |skp_path|
        directory = File.dirname(skp_path)
        meta = metadata[directory] || {}
        category, inferred_brand = category_brand_for(skp_path, root, MODEL_FOLDER_NAMES)
        brand = (meta['brand'] || inferred_brand).to_s.strip
        brand = DIRORY_BRAND if brand.empty?
        cache_path = cached_thumbnail_path(skp_path)
        sidecar = sidecar_thumbnail(skp_path, meta)
        all_models_in_dir = Dir.glob(File.join(directory, '*.skp'))
        display_name = all_models_in_dir.length == 1 ? (meta['name'] || File.basename(skp_path, File.extname(skp_path))) : File.basename(skp_path, File.extname(skp_path))
        items << {
          'id' => skp_path,
          'key' => relative_key(skp_path),
          'name' => display_name,
          'type' => 'model',
          'category' => meta['category'] || category,
          'brand' => brand,
          'sample' => sample_brand?(brand),
          'tags' => meta['tags'].is_a?(Array) ? meta['tags'] : [],
          'thumbnail' => sidecar || (File.file?(cache_path) ? cache_path : nil),
          'model_path' => skp_path,
          'material_path' => nil
        }
      end

      material_images = Dir.glob(File.join(root, '**', '*')).select do |path|
        next false unless File.file?(path) && IMAGE_EXTENSIONS.include?(File.extname(path).downcase)
        folders = relative_parts(path, root)[0...-1] || []
        folders.any? { |part| MATERIAL_FOLDER_NAMES.include?(part.downcase) }
      end
      material_images.each do |img_path|
        directory = File.dirname(img_path)
        meta = metadata[directory] || {}
        category, inferred_brand = category_brand_for(img_path, root, MATERIAL_FOLDER_NAMES)
        brand = (meta['brand'] || inferred_brand).to_s.strip
        brand = DIRORY_BRAND if brand.empty?
        base = File.basename(img_path, File.extname(img_path))
        display_name = base # a material is always named after its image file
        items << {
          'id' => img_path,
          'key' => relative_key(img_path),
          'name' => display_name,
          'type' => 'material',
          'category' => meta['category'] || category,
          'brand' => brand,
          'sample' => sample_brand?(brand),
          'tags' => meta['tags'].is_a?(Array) ? meta['tags'] : [],
          'thumbnail' => img_path,
          'model_path' => nil,
          'material_path' => img_path
        }
      end

      items.uniq! { |item| item['id'].to_s.downcase }
      items.sort_by { |item| [item['type'].to_s, item['category'].to_s.downcase, item['name'].to_s.downcase] }
    end

    def self.file_url(path)
      normalized = path.to_s.tr('\\', '/')
      if normalized =~ /\A([A-Za-z]:)\/(.*)\z/
        drive = Regexp.last_match(1)
        tail = Regexp.last_match(2)
        'file:///' + drive + '/' + tail.split('/').map { |part|
          URI.encode_www_form_component(part).gsub('+', '%20')
        }.join('/')
      else
        'file:///' + normalized.split('/').map { |part|
          URI.encode_www_form_component(part).gsub('+', '%20')
        }.join('/')
      end
    end

    # ------------------------------------------------------------------
    # Favourites: products the user starred, plus the ones they used before
    # (inserted or painted), remembered per computer. Both are stored by the
    # item's path relative to the library, so they survive a moved library.
    # ------------------------------------------------------------------
    RECENT_LIMIT = 60

    def self.read_key_list(setting)
      raw = Sketchup.read_default(SETTINGS_SECTION, setting, '[]')
      list = JSON.parse(raw.to_s)
      list.is_a?(Array) ? list.map(&:to_s) : []
    rescue StandardError
      []
    end

    def self.write_key_list(setting, list)
      Sketchup.write_default(SETTINGS_SECTION, setting, JSON.generate(list))
    end

    def self.favourite_keys
      read_key_list('favourites')
    end

    def self.recent_keys
      read_key_list('recent')
    end

    def self.toggle_favourite(key)
      key = key.to_s
      return if key.empty?
      list = favourite_keys
      list.include?(key) ? list.delete(key) : list.unshift(key)
      write_key_list('favourites', list)
      # M6: keep the server copy in step so favourites follow the account (FR-A22).
      Cloud.push_favourites(list, recent_keys)
    end

    # Most recent first, no duplicates. `key` is the cloud asset_id when known,
    # otherwise the legacy local-library path.
    def self.remember_used(path, key = nil)
      key = key.to_s
      key = relative_key(path) if key.empty?
      return if key.to_s.empty?
      list = [key] + (recent_keys - [key])
      write_key_list('recent', list.first(RECENT_LIMIT))
      push_favourites
      Cloud.push_favourites(favourite_keys, list.first(RECENT_LIMIT))
    rescue StandardError => e
      puts "[Dirory] could not remember used item: #{e.message}"
    end

    # M6: merge the server's lists into the local ones (union, local order first),
    # then push the merged result back so both sides agree.
    def self.merge_server_favourites(data)
      server_fav = Array(data['favourites']).map(&:to_s)
      server_recent = Array(data['recent']).map(&:to_s)
      fav = (favourite_keys + server_fav).uniq
      recent = (recent_keys + server_recent).uniq.first(RECENT_LIMIT)
      write_key_list('favourites', fav)
      write_key_list('recent', recent)
      push_favourites
      Cloud.push_favourites(fav, recent)
    rescue StandardError => e
      puts "[Dirory] could not merge favourites: #{e.message}"
    end

    def self.favourites_state
      { favourites: favourite_keys, recent: recent_keys }
    end

    def self.push_favourites
      return unless @dialog
      @dialog.execute_script("window.diroryFavourites(#{favourites_state.to_json});")
    rescue StandardError
      nil
    end

    # ------------------------------------------------------------------
    # Brand logos. Drop one picture per brand into <library>/Brands/, named
    # exactly like the brand folder:  Brands/Toto.png, Brands/ROMAN.jpg ...
    # (png, jpg, jpeg, webp, svg). Dirory's own brand uses the plugin logo.
    # Returns { 'toto' => 'file:///...' } keyed by lower-case brand name.
    # ------------------------------------------------------------------
    LOGO_EXTENSIONS = %w[.png .jpg .jpeg .webp .svg].freeze

    def self.brand_logos
      logos = {}
      own = File.join(PLUGIN_ROOT, 'ui', 'logo_small.png')
      logos[DIRORY_BRAND.downcase] = file_url(own) if File.file?(own)

      root = library_path
      return logos unless Dir.exist?(root)
      Dir.children(root).each do |name|
        folder = File.join(root, name)
        next unless File.directory?(folder) && %w[brands brand].include?(name.downcase)
        Dir.children(folder).each do |file|
          next unless LOGO_EXTENSIONS.include?(File.extname(file).downcase)
          logos[File.basename(file, '.*').downcase] = file_url(File.join(folder, file))
        end
      end
      logos
    rescue StandardError
      {}
    end

    # ------------------------------------------------------------------
    # Extract the saved Explorer/SketchUp preview from each model that has no
    # supplied sidecar image. SketchUp reads the thumbnail embedded in the SKP.
    # Returns [generated_count, failed_names].
    # ------------------------------------------------------------------
    def self.generate_missing_thumbnails
      generated = 0
      failed = []

      scan_library.each do |item|
        next unless item['type'] == 'model' && item['model_path']
        next if item['thumbnail'] # already has one (described or cached)

        cache_path = cached_thumbnail_path(item['model_path'])
        begin
          ok = Sketchup.save_thumbnail(item['model_path'], cache_path)
          ok ? (generated += 1) : (failed << item['name'])
        rescue StandardError
          failed << item['name']
        end
      end

      [generated, failed]
    end

    # ------------------------------------------------------------------
    # Everything Dirory puts into a SketchUp model (component definitions and
    # materials) is tagged with an attribute dictionary. That tag is what the
    # Usage tab reads to count models and painted areas, and it survives
    # saving/reopening the .skp.
    # ------------------------------------------------------------------
    ATTR_DICT = 'Dirory'.freeze
    SQIN_TO_SQM = 0.00064516

    # The panel sends { path, name, category, brand } as a JSON string.
    def self.parse_payload(arg)
      data = arg
      if arg.is_a?(String)
        data = begin
          JSON.parse(arg)
        rescue StandardError
          nil
        end
      end
      data = { 'path' => arg.to_s } unless data.is_a?(Hash)
      data
    end

    # Path relative to the library root, so counts stay grouped even if the
    # library folder is moved or renamed.
    def self.relative_key(path)
      full = File.expand_path(path.to_s).tr('\\', '/')
      root = File.expand_path(library_path).tr('\\', '/')
      full.sub(/\A#{Regexp.escape(root)}\/?/i, '')
    end

    def self.tag_entity(entity, data, type)
      path = data['path'].to_s
      asset_id = data['asset_id'].to_s
      # FR-A12: cloud items are tagged by their UUID as well as the existing
      # path-based id, so usage and favourites survive a cache move.
      id = asset_id.empty? ? relative_key(path) : asset_id
      entity.set_attribute(ATTR_DICT, 'id', id)
      entity.set_attribute(ATTR_DICT, 'asset_id', asset_id) unless asset_id.empty?
      entity.set_attribute(ATTR_DICT, 'type', type)
      entity.set_attribute(ATTR_DICT, 'name', (data['name'] || File.basename(path, '.*')).to_s)
      entity.set_attribute(ATTR_DICT, 'category', data['category'].to_s)
      entity.set_attribute(ATTR_DICT, 'brand', data['brand'].to_s)
    end

    def self.dirory_info(entity)
      dict = entity.attribute_dictionary(ATTR_DICT)
      return nil unless dict && dict['id']
      {
        'id' => dict['id'].to_s,
        'name' => (dict['name'].to_s.empty? ? File.basename(dict['id'].to_s, '.*') : dict['name']).to_s,
        'category' => dict['category'].to_s,
        'brand' => (dict['brand'].to_s.strip.empty? ? DIRORY_BRAND : dict['brand'].to_s)
      }
    end

    # ------------------------------------------------------------------
    # Insert a component (.skp): sticks to the cursor until the user
    # clicks in the model to place it — the same interactive placement
    # SketchUp's own Components browser uses.
    # ------------------------------------------------------------------
    def self.insert_model(payload)
      return unless Cloud.require_sign_in(@dialog)
      data = parse_payload(payload)
      resolve_asset_path(data) do |path, error|
        if error
          # UI calls must run on the main thread, not inside the HTTP callback.
          run_on_main_thread { UI.messagebox(error) }
        else
          # place_component starts an interactive tool. Starting it inside an
          # async HTTP callback silently does nothing — the cursor never picks
          # up the component. Hop back to the main thread first.
          run_on_main_thread { insert_model_file(data, path) }
        end
      end
    end

    # Run a block on the next main-thread tick. UI.start_timer(0.01, false) is
    # the documented way to leave a callback (HTTP, HTML dialog) and rejoin the
    # SketchUp main thread, where tool activation, send_action and
    # place_component actually take effect.
    #
    # Why this matters (both are known SketchUp quirks):
    #   * `Sketchup.send_action('selectPaintTool:')` called directly from an
    #     HtmlDialog callback frequently does NOT activate the Paint tool.
    #   * `model.place_component` "queues the action until Ruby relinquishes
    #     control to the GUI", so it must run after the callback returns.
    # The forum workaround for both is a timer, plus `Sketchup.focus` to make
    # sure the 3D view has focus when the tool activates.
    def self.run_on_main_thread(&block)
      UI.start_timer(0.1, false) do
        begin
          begin
            Sketchup.focus
          rescue StandardError
            nil
          end
          block.call
        rescue StandardError => e
          # An exception inside a timer is otherwise swallowed and the click
          # looks like it did nothing. Always log it and tell the user.
          puts "[Dirory] #{e.class}: #{e.message}"
          puts e.backtrace.first(6).join("\n") if e.backtrace
          UI.messagebox("Dirory could not finish that action:\n#{e.class}: #{e.message}")
        end
      end
    rescue StandardError
      # If the timer cannot be scheduled, fall back to running inline.
      block.call
    end

    # A card may be a local file (legacy folder library) or a cloud asset that
    # must be downloaded to the cache first (FR-A11). Yields (path, nil) or
    # (nil, message). The yield may happen later (async HTTP), so callers must
    # not assume they are still on the main thread.
    def self.resolve_asset_path(data)
      path = data['path'].to_s
      if !path.empty? && File.exist?(path)
        yield(path, nil)
        return
      end
      if Cloud.uuid_like?(data['asset_id'])
        Sketchup.set_status_text('Dirory: downloading the file…', SB_PROMPT)
        Cloud.download_asset(data) do |local, error|
          if local
            data['path'] = local
            yield(local, nil)
          else
            yield(nil, error || 'The file could not be downloaded.')
          end
        end
      else
        yield(nil, 'This item is not available on this computer. Click ⟳ to refresh the catalogue.')
      end
    end

    def self.insert_model_file(data, path)
      unless File.extname(path).downcase == '.skp'
        UI.messagebox("This card does not point to a SketchUp model (.skp):\n#{path}")
        return
      end
      unless File.file?(path) && File.size(path) > 0
        UI.messagebox("This model file is missing or empty:\n#{path}")
        return
      end

      model = Sketchup.active_model
      started = false
      begin
        Sketchup.set_status_text('Dirory: loading SketchUp model…', SB_PROMPT)
        comp_def = nil
        begin
          model.start_operation('Load Dirory Model', true)
          started = true
          comp_def = with_loading_cursor { model.definitions.load(path) }
          tag_entity(comp_def, data, 'model') if comp_def
          model.commit_operation
          started = false
        rescue StandardError
          model.abort_operation if started
          started = false
          raise
        end
        unless comp_def
          UI.messagebox("SketchUp could not load this model:\n#{path}")
          Sketchup.set_status_text('')
          return
        end
        remember_used(path, data['asset_id'])

        # Hand the keyboard/mouse back to the 3D view, otherwise the placement
        # tool starts but the model never follows the cursor while the Dirory
        # panel still has focus.
        begin
          Sketchup.focus
        rescue StandardError
          nil
        end
        Sketchup.set_status_text('Dirory: click in the model to place it. Press Esc to cancel.', SB_PROMPT)
        model.place_component(comp_def)
      rescue StandardError => e
        model.abort_operation if started
        puts "[Dirory] insert_model_file failed: #{e.class}: #{e.message}"
        Sketchup.set_status_text('')
        UI.messagebox("Couldn't load this model:\n#{e.class}: #{e.message}")
      end
    end

    # Use Windows' animated app-starting cursor while SketchUp synchronously
    # reads a potentially large SKP. The cursor is restored even on failure.
    def self.with_loading_cursor
      return yield unless defined?(DiroryBusyCursorApi)
      begin
        busy = DiroryBusyCursorApi.LoadCursorA(
          Fiddle::Pointer.new(0), Fiddle::Pointer.new(32650)) # IDC_APPSTARTING
        return yield unless busy
        previous = DiroryBusyCursorApi.SetCursor(busy)
      rescue StandardError
        return yield
      end
      begin
        yield
      ensure
        DiroryBusyCursorApi.SetCursor(previous) if previous
      end
    end

    # ------------------------------------------------------------------
    # A click-to-paint tool: stays active so the user can click several
    # faces in a row, like SketchUp's native Paint Bucket tool. It is only the
    # fallback for when SketchUp refuses to switch to its own Paint Bucket.
    #
    # v0.6.1 fixes:
    #  * shows a paint-bucket pointer (onSetCursor) so it is obvious the tool
    #    is active;
    #  * paints the side of the face you actually click (front OR back) - a
    #    plane drawn on the ground usually shows its back side from above, and
    #    painting the hidden front side looked like "nothing happened";
    #  * looks through edges under the pointer to the face behind them;
    #  * reports errors instead of silently aborting.
    # ------------------------------------------------------------------
    class MaterialPaintTool
      CURSOR_HOT_X = 4
      CURSOR_HOT_Y = 27

      def self.cursor_id
        return @cursor_id if @cursor_id
        file = File.join(PLUGIN_ROOT, 'ui', 'paint_cursor.png')
        @cursor_id = File.file?(file) ? UI.create_cursor(file, CURSOR_HOT_X, CURSOR_HOT_Y).to_i : 0
      rescue StandardError => e
        puts "[Dirory] could not create the paint cursor: #{e.message}"
        @cursor_id = 0
      end

      def initialize(material)
        @material = material
        @face = nil
        @transform = nil
      end

      def activate
        update_status
      end

      def resume(view)
        update_status
        view.invalidate
      end

      def deactivate(view)
        view.invalidate
      end

      def update_status
        Sketchup.set_status_text("Click a surface to paint it with \"#{@material.display_name}\". Press Esc to stop.", SB_PROMPT)
      end

      def onSetCursor
        id = self.class.cursor_id
        return false unless id && id > 0
        UI.set_cursor(id)
        true
      rescue StandardError
        false
      end

      # Returns [face, transformation] for the first face under the pointer.
      # Edges that sit on top of the face are skipped, not treated as a miss.
      def pick_face(view, x, y)
        ph = view.pick_helper
        ph.do_pick(x, y)
        ph.count.times do |index|
          path = ph.path_at(index)
          next unless path
          face = path.reverse.find { |entity| entity.is_a?(Sketchup::Face) }
          next unless face && face.valid?
          transform = begin
            ph.transformation_at(index)
          rescue StandardError
            nil
          end
          return [face, transform || Geom::Transformation.new]
        end
        face = ph.picked_face
        return [face, Geom::Transformation.new] if face && face.valid?
        [nil, nil]
      rescue StandardError
        [nil, nil]
      end

      # True when the camera is looking at the back of the face.
      def back_side?(view, x, y, face, transform)
        ray = view.pickray(x, y)
        direction = ray[1]
        normal = face.normal.transform(transform)
        normal.dot(direction) > 0
      rescue StandardError
        false
      end

      def onMouseMove(_flags, x, y, view)
        @face, @transform = pick_face(view, x, y)
        view.invalidate
      end

      def draw(view)
        return unless @face && @face.valid?
        transform = @transform || Geom::Transformation.new
        mesh = @face.mesh
        triangles = []
        (1..mesh.count_polygons).each do |index|
          polygon = mesh.polygon_points_at(index)
          next if polygon.length < 3
          (1..polygon.length - 2).each do |i|
            triangles << polygon[0].transform(transform)
            triangles << polygon[i].transform(transform)
            triangles << polygon[i + 1].transform(transform)
          end
        end
        view.drawing_color = Sketchup::Color.new(55, 150, 255, 100)
        view.draw(GL_TRIANGLES, triangles) unless triangles.empty?
        edge_points = []
        @face.outer_loop.edges.each do |edge|
          edge_points << edge.start.position.transform(transform)
          edge_points << edge.end.position.transform(transform)
        end
        view.drawing_color = Sketchup::Color.new(40, 145, 255)
        view.draw(GL_LINES, edge_points) unless edge_points.empty?
      rescue StandardError
        # If SketchUp cannot draw a face mesh, painting remains available.
      end

      def onLButtonDown(_flags, x, y, view)
        face, transform = pick_face(view, x, y)
        unless face
          Sketchup.set_status_text('Dirory: no surface under the pointer. Click on a face to paint it.', SB_PROMPT)
          return
        end

        back = back_side?(view, x, y, face, transform)
        model = view.model
        model.start_operation('Apply Dirory Material', true)
        begin
          if back
            face.back_material = @material
          else
            face.material = @material
          end
          model.commit_operation
        rescue StandardError => e
          model.abort_operation
          puts "[Dirory] paint failed: #{e.class}: #{e.message}"
          UI.messagebox("Dirory could not paint this surface:\n#{e.message}")
        end
        view.invalidate
      end

      def onCancel(_reason, view)
        view.model.select_tool(nil)
      end
    end

    # ------------------------------------------------------------------
    # Tile size. Material images are named "... 60x120.jpeg" (size in cm, as
    # width x height of the image). SketchUp gives every new texture the same
    # default square scale, so a 60x120 tile comes out squashed. Here the real
    # size is read from the file name and applied to the texture. GROUT_MM is
    # added because the images carry a grout joint on their top/left edge
    # (tile + joint = one repeat of the texture).
    # ------------------------------------------------------------------
    GROUT_MM = 3.0
    TILE_SIZE_RE = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*\z/i

    def self.tile_size_cm(path)
      base = File.basename(path, File.extname(path))
      m = base.match(TILE_SIZE_RE)
      return nil unless m
      w = m[1].to_f
      h = m[2].to_f
      (w > 0 && h > 0) ? [w, h] : nil
    end

    # FR-A13: prefer the server's tile_size_cm, fall back to the filename.
    def self.tile_size_for(data, path)
      server = data['tile_size_cm']
      if server.is_a?(Array) && server.length >= 2 &&
         server[0].to_f > 0 && server[1].to_f > 0
        return [server[0].to_f, server[1].to_f]
      end
      tile_size_cm(path)
    end

    # only_if_distorted: for a material that already exists, only touch it when
    # its proportions are wrong, so a size the user changed by hand (same
    # proportions) is left alone.
    def self.fit_tile_size(material, path, only_if_distorted = false, size = nil)
      size ||= tile_size_cm(path)
      tex = material.texture
      return unless size && tex
      w = (size[0] * 10.0 + GROUT_MM).mm
      h = (size[1] * 10.0 + GROUT_MM).mm
      if only_if_distorted
        cur_h = tex.height.to_f
        if cur_h > 0
          return if ((tex.width.to_f / cur_h) / (w.to_f / h.to_f) - 1.0).abs < 0.02
        end
      end
      begin
        tex.size = [w, h]
      rescue StandardError
        tex.size = w # older SketchUp: width only, height follows the image
      end
    rescue StandardError
      nil
    end

    # ------------------------------------------------------------------
    # Apply a material (image file): load it into the model, make it the
    # CURRENT material, then switch to SketchUp's own Paint Bucket tool — so
    # it behaves exactly like picking a material in the Materials window.
    # ------------------------------------------------------------------
    def self.material_for(model, path, key = nil, size = nil)
      key = relative_key(path) if key.to_s.empty?
      base = File.basename(path, File.extname(path))

      # 1) A material Dirory already created for this same asset/file.
      model.materials.each do |m|
        dict = m.attribute_dictionary(ATTR_DICT)
        if dict && (dict['id'] == key || (dict['asset_id'] && dict['asset_id'] == key))
          fit_tile_size(m, path, true, size)
          return m
        end
      end

      # 2) An untagged material from an earlier Dirory version (same name, same image).
      legacy = model.materials[base]
      if legacy && legacy.attribute_dictionary(ATTR_DICT).nil? && legacy.texture &&
         File.basename(legacy.texture.filename.to_s).casecmp?(File.basename(path))
        fit_tile_size(legacy, path, true, size)
        return legacy
      end

      # 3) Otherwise create one — never overwrite a user's own material that
      #    just happens to share the name.
      name = legacy ? model.materials.unique_name(base) : base
      material = model.materials.add(name)
      material.texture = path
      fit_tile_size(material, path, false, size)
      material
    end

    # True when SketchUp's own Paint Bucket is the active tool.
    def self.paint_tool_active?(model)
      model.tools.active_tool_name.to_s =~ /paint/i ? true : false
    rescue StandardError
      false
    end

    # Make `material` current and switch to SketchUp's own Paint Bucket (real
    # bucket pointer, Alt to sample, Ctrl/Shift fill modes). If SketchUp does
    # not actually switch - send_action is unreliable when triggered from a
    # dialog - a moment later we check and fall back to Dirory's own paint
    # tool, which always activates and shows a paint-bucket pointer.
    def self.activate_paint_bucket(model, material)
      model.materials.current = material

      begin
        if RUBY_PLATFORM =~ /mswin|mingw/i
          Sketchup.send_action(21074)
        else
          Sketchup.send_action('selectPaintTool:')
        end
      rescue StandardError => e
        puts "[Dirory] could not select the native Paint Bucket: #{e.message}"
      end

      UI.start_timer(0.25, false) do
        begin
          active = Sketchup.active_model
          unless paint_tool_active?(active)
            active.materials.current = material
            active.select_tool(MaterialPaintTool.new(material))
          end
        rescue StandardError => e
          puts "[Dirory] could not select the paint tool: #{e.class}: #{e.message}"
          UI.messagebox("Dirory could not activate the paint tool:\n#{e.message}")
        end
      end
    end

    def self.apply_material(payload)
      return unless Cloud.require_sign_in(@dialog)
      data = parse_payload(payload)
      resolve_asset_path(data) do |path, error|
        if error
          run_on_main_thread { UI.messagebox(error) }
        else
          # activate_paint_bucket / select_tool also must run on the main
          # thread; inside an HTTP callback the tool never becomes active.
          run_on_main_thread { apply_material_file(data, path) }
        end
      end
    end

    def self.apply_material_file(data, path)
      unless IMAGE_EXTENSIONS.include?(File.extname(path).downcase)
        UI.messagebox("This card does not point to a supported material image:\n#{path}")
        return
      end

      model = Sketchup.active_model
      started = false
      begin
        model.start_operation('Load Dirory Material', true)
        started = true
        key = data['asset_id'].to_s.empty? ? nil : data['asset_id'].to_s
        size = tile_size_for(data, path)
        material = material_for(model, path, key, size)
        tag_entity(material, data, 'material')
        model.commit_operation
        started = false
        remember_used(path, data['asset_id'])
        activate_paint_bucket(model, material)
      rescue StandardError => e
        begin
          model.abort_operation if started
        rescue StandardError
        end
        UI.messagebox("Couldn't prepare material:\n#{e.message}")
      end
    end

    # ------------------------------------------------------------------
    # Usage report: how many Dirory models are in the model, and how many
    # faces / how much area is painted with Dirory materials.
    #
    # It is computed by reading the model itself (not by counting clicks), so
    # it stays correct after undo, deleting, exploding, or painting with the
    # native Paint Bucket. Faces inside groups/components are counted once for
    # every copy of that group/component, with the copy's scale applied to
    # the area. A face painted the same on both sides counts once.
    # ------------------------------------------------------------------
    def self.walk_usage(entities, transform, inherited, ctx)
      entities.each do |e|
        case e
        when Sketchup::Face
          sides = [e.material || inherited, e.back_material || inherited].compact
          ids = sides.map { |m| ctx[:mat_ids][m.name] }.compact.uniq
          next if ids.empty?
          area = begin
            e.area(transform)
          rescue StandardError
            e.area
          end
          ids.each do |id|
            row = ctx[:materials][id]
            row['faces'] += 1
            row['area_in2'] += area
          end
        when Sketchup::Group, Sketchup::ComponentInstance
          defn = e.definition
          if e.is_a?(Sketchup::ComponentInstance)
            id = ctx[:def_ids][defn.name]
            ctx[:models][id]['count'] += 1 if id
          end
          walk_usage(defn.entities, transform * e.transformation, e.material || inherited, ctx)
        end
      end
    end

    def self.usage_report
      model = Sketchup.active_model
      ctx = { models: {}, materials: {}, def_ids: {}, mat_ids: {} }

      model.definitions.each do |defn|
        info = dirory_info(defn)
        next unless info
        ctx[:def_ids][defn.name] = info['id']
        ctx[:models][info['id']] ||= info.merge('count' => 0)
      end

      model.materials.each do |mat|
        info = dirory_info(mat)
        next unless info
        ctx[:mat_ids][mat.name] = info['id']
        ctx[:materials][info['id']] ||= info.merge('faces' => 0, 'area_in2' => 0.0)
      end

      walk_usage(model.entities, Geom::Transformation.new, nil, ctx)

      sorter = ->(r) { [r['brand'].to_s.downcase, r['category'].to_s.downcase, r['name'].to_s.downcase] }
      models = ctx[:models].values.sort_by(&sorter)
      materials = ctx[:materials].values.sort_by(&sorter).map do |r|
        r.merge('area_m2' => (r['area_in2'] * SQIN_TO_SQM).round(2))
      end
      materials.each { |r| r.delete('area_in2') }

      { 'models' => models, 'materials' => materials }
    end

    def self.send_usage_report
      return unless @dialog
      begin
        @dialog.execute_script("window.diroryReport(#{usage_report.to_json});")
      rescue StandardError => e
        @dialog.execute_script("window.diroryError && window.diroryError(#{e.message.to_json});")
      end
    end

    # ------------------------------------------------------------------
    # Ask for a Quote: the user ticks one or more brands in the Usage tab and
    # we open WhatsApp with a ready-made message listing what is used in the
    # model for those brands.
    # ------------------------------------------------------------------
    QUOTE_WHATSAPP_NUMBER = '6285710086041'.freeze
    NO_BRAND_LABEL = 'No brand'.freeze

    def self.quote_message(report, brands, compact = false)
      title = Sketchup.active_model.title.to_s
      lines = ["Hello, I'd like to request a quote for these items from my SketchUp model (via Dirory):"]
      lines << "Project: #{title}" unless title.empty?
      lines << ''
      any = false
      brands.each do |brand|
        same_brand = ->(r) { (r['brand'].to_s.empty? ? NO_BRAND_LABEL : r['brand']) == brand }
        models = report['models'].select { |r| same_brand.call(r) && r['count'] > 0 }
        mats = report['materials'].select { |r| same_brand.call(r) && r['faces'] > 0 }
        next if models.empty? && mats.empty?
        any = true
        lines << "*#{brand}*"
        if compact
          area = mats.map { |r| r['area_m2'] }.sum.round(2)
          lines << "- #{models.map { |r| r['count'] }.sum} model(s), #{mats.length} material(s), #{area} m2 painted"
        else
          models.each { |r| lines << "- #{r['name']} x #{r['count']}" }
          mats.each { |r| lines << "- #{r['name']} (material) - #{'%.2f' % r['area_m2']} m2" }
        end
        lines << ''
      end
      any ? lines.join("\n").strip : nil
    end

    def self.whatsapp_url(message)
      text = URI.encode_www_form_component(message).gsub('+', '%20')
      "https://wa.me/#{QUOTE_WHATSAPP_NUMBER}?text=#{text}"
    end

    # FR-A20 (M6): the quote is created server-side with a consent form. The
    # panel collects the details and calls back here; WhatsApp stays optional.
    def self.quote_result(ok, error = nil)
      return unless @dialog
      @dialog.execute_script("window.diroryQuoteResult(#{ { ok: ok, error: error }.to_json });")
    rescue StandardError
      nil
    end

    # payload: brands + consent fields from the panel.
    def self.request_quote(payload)
      return unless Cloud.require_sign_in(@dialog)
      data = parse_payload(payload)
      brands = Array(data['brands']).map(&:to_s)
      # Dirory's own free samples have no vendor to quote.
      brands = brands.reject { |b| sample_brand?(b) }
      if brands.empty?
        UI.messagebox('Please tick at least one brand to ask for a quote. Free Dirory samples cannot be quoted.')
        return
      end
      report = usage_report
      data['brands'] = brands

      # Server-side quote with the architect's consent form (M6). Falls back to
      # the WhatsApp hand-off alone when not signed in to the cloud.
      posted = Cloud.post_quote(data, report)
      if posted
        UI.messagebox('Your quote request was sent to the brand(s). You can also continue in WhatsApp.')
      end

      message = quote_message(report, brands)
      return unless message
      url = whatsapp_url(message)
      # Very long lists can exceed what browsers accept in a link; fall back
      # to a per-brand summary in that case.
      url = whatsapp_url(quote_message(report, brands, true)) if url.length > 6000
      UI.openURL(url)
    end

    def self.csv_escape(value)
      text = value.to_s
      text =~ /[",\r\n]/ ? "\"#{text.gsub('"', '""')}\"" : text
    end

    def self.export_usage_csv
      # Open the save dialog after the CEF callback returns (same as folder picker).
      UI.start_timer(0.1, false) do
        begin
          report = usage_report
          path = UI.savepanel('Export Dirory usage', Dir.home, 'Dirory_usage.csv')
          next unless path
          path += '.csv' unless path.downcase.end_with?('.csv')
          rows = [['Type', 'Name', 'Category', 'Brand', 'Quantity', 'Faces painted', 'Area (m2)']]
          report['models'].each do |r|
            rows << ['Model', r['name'], r['category'], r['brand'], r['count'], '', '']
          end
          report['materials'].each do |r|
            rows << ['Material', r['name'], r['category'], r['brand'], '', r['faces'], r['area_m2']]
          end
          body = rows.map { |row| row.map { |v| csv_escape(v) }.join(',') }.join("\r\n") + "\r\n"
          File.open(path, 'wb') { |f| f.write("\xEF\xBB\xBF".b + body.encode('UTF-8').b) }
          UI.messagebox("Usage exported to:\n#{path}")
        rescue StandardError => e
          UI.messagebox("Dirory could not export the report:\n#{e.class}: #{e.message}")
        end
      end
    end

    # ------------------------------------------------------------------
    # The panel.
    # ------------------------------------------------------------------
    @dialog = nil

    def self.show_panel
      if @dialog && @dialog.visible?
        @dialog.bring_to_front
        return
      end

      begin
        @dialog = UI::HtmlDialog.new(
          dialog_title: 'Dirory',
          preferences_key: 'com.dirory.library',
          scrollable: true,
          resizable: true,
          width: 360,
          height: 580,
          min_width: 300,
          min_height: 400,
          style: UI::HtmlDialog::STYLE_DIALOG
        )
        panel_path = File.join(PLUGIN_ROOT, 'ui', 'panel.html')
        unless File.exist?(panel_path)
          UI.messagebox("Dirory: panel.html not found at:\n#{panel_path}\nThe extension may not have installed correctly.")
          return
        end
        @dialog.set_file(panel_path)

        @dialog.add_action_callback('ready')  { |_ctx| send_library }
        @dialog.add_action_callback('rescan') { |_ctx| Cloud.fetch_catalog }

        @dialog.add_action_callback('insertModel') { |_ctx, payload| insert_model(payload) }
        @dialog.add_action_callback('applyMaterial') { |_ctx, payload| apply_material(payload) }

        @dialog.add_action_callback('requestReport') { |_ctx| send_usage_report }
        @dialog.add_action_callback('exportReport') { |_ctx| export_usage_csv }
        @dialog.add_action_callback('requestQuote') { |_ctx, payload| request_quote(payload) }

        @dialog.add_action_callback('generateThumbnails') do |_ctx|
          generated, failed = generate_missing_thumbnails
          send_library
          if generated.zero? && failed.empty?
            UI.messagebox('Every model already has a thumbnail.')
          elsif failed.any?
            UI.messagebox("Generated #{generated} thumbnail(s). Couldn't generate for: #{failed.join(', ')}.")
          end
        end

        @dialog.add_action_callback('chooseFolder') { |_ctx| defer_folder_picker }

        # Account and cloud
        @dialog.add_action_callback('signIn') do |_ctx, _payload|
          error = Cloud.sign_in_start(@dialog)
          push_account(error)
        end
        @dialog.add_action_callback('openSignInPage') { |_ctx| Cloud.open_sign_in_page }
        @dialog.add_action_callback('cancelSignIn') do |_ctx|
          Cloud.cancel_sign_in
          push_account
        end
        @dialog.add_action_callback('signOut') do |_ctx|
          Cloud.sign_out
          push_account
        end
        @dialog.add_action_callback('setShareUsage') do |_ctx, payload|
          data = parse_payload(payload)
          Cloud.set_share_usage(data['on'] ? true : false)
          push_account
        end
        # v0.5.2: project-title sharing is a separate consent (UU 27/2022).
        @dialog.add_action_callback('setShareProject') do |_ctx, payload|
          data = parse_payload(payload)
          Cloud.set_share_project(data['on'] ? true : false)
          push_account
        end
        @dialog.add_action_callback('openPrivacy') { |_ctx| UI.openURL(PRIVACY_URL) }
        @dialog.add_action_callback('toggleFavourite') { |_ctx, key| toggle_favourite(key) }
        # Search returned 0 results across the whole library.
        @dialog.add_action_callback('searchMiss') do |_ctx, payload|
          Cloud.safely { Cloud.record_search_miss(parse_payload(payload)) }
        end

        @dialog.show
        puts "[Dirory] panel opened, serving #{panel_path}"
      rescue StandardError => e
        UI.messagebox("Dirory failed to open the panel:\n#{e.class}: #{e.message}")
        puts "[Dirory] show_panel error: #{e.class}: #{e.message}"
        puts e.backtrace.join("\n")
      end
    end

    def self.send_library
      return unless @dialog
      # M6: prefer the cloud catalogue; fall back to the local folder when the
      # server is not configured (the app stays usable offline / pre-M6).
      if Cloud.configured?
        Cloud.fetch_catalog
      else
        render_from_scan
      end
    end

    # Render a catalogue payload (cloud or cached) in the panel.
    def self.render_catalog(data, note = nil)
      return unless @dialog
      data ||= { 'items' => [], 'brand_logos' => {} }
      payload = JSON.parse(JSON.generate(data)) # deep copy we can mutate
      payload['items'] = Array(payload['items']).map do |item|
        copy = item.dup
        # Cloud thumbnails arrive as signed URLs; local ones as file paths.
        copy['thumbnail_url'] ||= file_url(copy['thumbnail']) if copy['thumbnail']
        copy
      end
      push_render_payload(payload, note)
    rescue StandardError => e
      @dialog.execute_script("window.diroryError && window.diroryError(#{e.message.to_json});")
    end

    # Legacy/local path: scan the folder (the pre-M6 behaviour).
    def self.render_from_scan
      items = scan_library.map do |item|
        copy = item.dup
        copy['thumbnail_url'] = file_url(copy['thumbnail']) if copy['thumbnail']
        copy
      end
      push_render_payload(
        { 'items' => items, 'brand_logos' => brand_logos },
        nil,
        library_path
      )
    rescue StandardError => e
      @dialog.execute_script("window.diroryError && window.diroryError(#{e.message.to_json});")
    end

    def self.push_render_payload(payload, note = nil, path_label = nil)
      return unless @dialog
      data = {
        path: path_label || (Cloud.configured? ? "Dirory cloud" : library_path),
        items: payload['items'] || [],
        account: Cloud.account_state,
        favourites: favourite_keys,
        recent: recent_keys,
        brand_logos: payload['brand_logos'] || {},
        note: note
      }
      @dialog.execute_script("window.diroryRender(#{data.to_json});")
    end

    # Called by Cloud once the device sign-in completes: re-render so cloud
    # fields (signed thumbnails, favourites) appear.
    def self.signed_in_now
      send_library if @dialog && @dialog.visible?
    rescue StandardError => e
      puts "[Dirory] post sign-in refresh failed: #{e.message}"
    end

    def self.push_account(error = nil)
      return unless @dialog
      @dialog.execute_script("window.diroryAccount(#{Cloud.account_state(error).to_json});")
    end

    def self.defer_folder_picker
      # Open the native Windows picker after the CEF callback returns.
      UI.start_timer(0.1, false) do
        begin
          folder = UI.select_directory(
            title: 'Choose your Dirory library folder',
            directory: library_path)
          if folder && Dir.exist?(folder)
            self.library_path = folder
            send_library if @dialog && @dialog.visible?
          end
        rescue StandardError => error
          UI.messagebox("Dirory could not open the folder picker:\n#{error.class}: #{error.message}")
        end
      end
    end

    # ------------------------------------------------------------------
    # Menu + toolbar
    # ------------------------------------------------------------------
    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Dirory')
      menu.add_item('Open Library Panel') { show_panel }
      menu.add_item('Choose Library Folder…') { defer_folder_picker }
      menu.add_separator
      menu.add_item('Send Usage Now') { Cloud.send_now }
      menu.add_item('Cloud Status…') { Cloud.show_status }
      menu.add_item('Test Connection…') { Cloud.test_connection }
      menu.add_item('Connection Settings…') { Cloud.connection_settings }

      toolbar = UI::Toolbar.new('Dirory')
      cmd = UI::Command.new('Dirory') { show_panel }
      cmd.tooltip = 'Open Dirory'
      cmd.status_bar_text = 'Browse, insert and paint models/materials from your Dirory library'
      icon = File.join(PLUGIN_ROOT, 'ui', 'icon.png')
      if File.exist?(icon)
        cmd.small_icon = icon
        cmd.large_icon = icon
      end
      toolbar.add_item(cmd)
      toolbar.show

      Cloud.start

      file_loaded(__FILE__)
    end
  end
end
