require 'sketchup.rb'
require 'json'
require 'fileutils'

# ----------------------------------------------------------------------
# Dirory self-update.
#
# A running SketchUp extension cannot overwrite its own code: the Ruby is already
# loaded, and on Windows the files are locked. So the update is staged and the
# swap happens at the NEXT SketchUp launch:
#
#   1. Download the new .rbz (a ZIP) from the release endpoint.
#   2. Extract it into ~/.dirory/pending/extracted/.
#   3. Write ~/.dirory/pending/apply_update.rb, which REPLACES the installed
#      extension (the dirory_library folder and its loader file) with the
#      extracted one: the old folder is backed up to ~/.dirory/previous_version,
#      deleted, and the new one copied in whole. Copying over the top would keep
#      files a release removed, and a signed extension must contain exactly the
#      files its signature lists, or SketchUp reports it unsigned/modified. If
#      the copy fails, the backup is put back.
#   4. Drop a tiny loader into the SketchUp Plugins folder. SketchUp runs every
#      *.rb there at startup, so on the next launch the loader applies the swap
#      and deletes itself.
#
# The user experience: click Update, restart SketchUp. No Extension Manager and
# no manual unzip. Sign-in and settings survive because the token and preferences
# live in SketchUp's own defaults and in ~/.dirory, not inside the plugin folder.
# ----------------------------------------------------------------------
module Dirory
  module Library
    module Updater
      PENDING_DIR   = File.join(Dir.home, '.dirory', 'pending').freeze
      STAGED_RBZ    = File.join(PENDING_DIR, 'dirory_library.rbz').freeze
      EXTRACT_DIR   = File.join(PENDING_DIR, 'extracted').freeze
      APPLY_SCRIPT  = File.join(PENDING_DIR, 'apply_update.rb').freeze
      BACKUP_DIR    = File.join(Dir.home, '.dirory', 'previous_version').freeze
      LOADER_NAME   = 'zzz_dirory_update_loader.rb'.freeze

      # The extension folder name inside the archive / Plugins directory.
      EXTENSION_DIR = 'dirory_library'.freeze
      LOADER_FILE   = 'dirory_library.rb'.freeze

      def self.pending_dir
        FileUtils.mkdir_p(PENDING_DIR)
        PENDING_DIR
      end

      def self.staged?
        complete_archive?(EXTRACT_DIR)
      end

      # A release must carry the whole extension: the loader file and its
      # folder. Anything less would replace a working install with half of one.
      # Signed releases from the Extension Warehouse ship main.rbe, not main.rb.
      def self.complete_archive?(dir)
        File.file?(File.join(dir, LOADER_FILE)) &&
          %w[main.rb main.rbe].any? { |f| File.file?(File.join(dir, EXTENSION_DIR, f)) }
      rescue StandardError
        false
      end

      # The folder Dirory is installed in (the one holding dirory_library.rb),
      # which is not always SketchUp's default Plugins folder.
      def self.plugins_dir
        file = __FILE__.dup
        file.force_encoding('UTF-8') if file.respond_to?(:force_encoding)
        File.dirname(File.dirname(File.expand_path(file)))
      rescue StandardError
        nil
      end

      # Compare "0.8.3" style versions; true when `remote` is newer than `local`.
      def self.newer?(remote, local)
        r = remote.to_s.split(/[.\-]/).map(&:to_i)
        l = local.to_s.split(/[.\-]/).map(&:to_i)
        [r.length, l.length].max.times do |i|
          a = r[i] || 0
          b = l[i] || 0
          return true if a > b
          return false if a < b
        end
        false
      end

      # ZIP write is not available in plain Ruby; SketchUp ships an extractor we
      # can rely on for a .rbz. It writes into `dest` and returns the paths.
      def self.extract(rbz_path, dest)
        FileUtils.rm_rf(dest)
        FileUtils.mkdir_p(dest)
        # `Sketchup::Zip` is not public; the documented route is the archive
        # installer, but that would go through the Extension Manager. Instead we
        # shell out to the OS unzip when present (Windows 10+ has tar.exe which
        # reads zip), else use the sketchup-unzip fallback below.
        ok = try_system_unzip(rbz_path, dest)
        ok
      end

      def self.try_system_unzip(rbz_path, dest)
        # Windows 10+ ships tar.exe which handles .zip; macOS/Linux have unzip.
        if RUBY_PLATFORM =~ /mswin|mingw/i
          system('tar', '-xf', rbz_path, '-C', dest)
        else
          system('unzip', '-o', rbz_path, '-d', dest)
        end
      end

      # Stage an already-downloaded archive for installation on the next launch.
      def self.stage_from_file(rbz_path)
        pending_dir
        FileUtils.cp(rbz_path, STAGED_RBZ)
        return false unless extract(STAGED_RBZ, EXTRACT_DIR)
        unless complete_archive?(EXTRACT_DIR)
          puts '[Dirory] update not staged: the archive is not a complete Dirory extension.'
          FileUtils.rm_rf(EXTRACT_DIR)
          return false
        end
        write_apply_script
        write_loader
        true
      rescue StandardError => e
        puts "[Dirory] could not stage update: #{e.message}"
        false
      end

      def self.write_apply_script
        script = <<~'RUBY'
          # Generated by Dirory. Replaces the installed extension with a staged
          # update at SketchUp startup, keeping a backup and restoring it if the
          # copy fails. Safe to delete.
          require 'fileutils'

          begin
            extract = '<EXTRACT_DIR>'
            backup  = '<BACKUP_DIR>'
            ext_dir = '<EXTENSION_DIR>'
            loader  = '<LOADER_FILE>'
            plugins = '<PLUGINS_DIR>'
            src_dir = File.join(extract, ext_dir)
            src_rb  = File.join(extract, loader)
            if !plugins.empty? && File.directory?(plugins) && File.directory?(src_dir) && File.file?(src_rb)
              dest_dir = File.join(plugins, ext_dir)
              dest_rb  = File.join(plugins, loader)

              FileUtils.rm_rf(backup)
              FileUtils.mkdir_p(backup)
              FileUtils.cp_r(dest_dir, backup) if File.directory?(dest_dir)
              FileUtils.cp(dest_rb, backup) if File.file?(dest_rb)

              begin
                FileUtils.rm_rf(dest_dir)
                FileUtils.cp_r(src_dir, plugins)
                FileUtils.cp(src_rb, plugins)
                puts '[Dirory] update applied.'
              rescue StandardError => e
                puts "[Dirory] update failed, restoring the previous version: #{e.class}: #{e.message}"
                FileUtils.rm_rf(dest_dir)
                old_dir = File.join(backup, ext_dir)
                old_rb  = File.join(backup, loader)
                FileUtils.cp_r(old_dir, plugins) if File.directory?(old_dir)
                FileUtils.cp(old_rb, plugins) if File.file?(old_rb)
              end
            else
              puts '[Dirory] update skipped: the staged files are incomplete.'
            end
          rescue StandardError => e
            puts "[Dirory] update failed: #{e.class}: #{e.message}"
          ensure
            begin
              FileUtils.rm_rf('<PENDING_DIR>')
            rescue StandardError
            end
          end
        RUBY
        script = script.gsub('<EXTRACT_DIR>', EXTRACT_DIR).gsub('<PENDING_DIR>', PENDING_DIR)
                       .gsub('<BACKUP_DIR>', BACKUP_DIR).gsub('<EXTENSION_DIR>', EXTENSION_DIR)
                       .gsub('<LOADER_FILE>', LOADER_FILE).gsub('<PLUGINS_DIR>', plugins_dir.to_s)
        File.write(APPLY_SCRIPT, script, encoding: 'UTF-8')
      end

      def self.write_loader
        plugins = plugins_dir
        return false unless plugins
        loader = File.join(plugins, LOADER_NAME)
        File.write(loader, <<~'RUBY', encoding: 'UTF-8')
          # Dirory update loader: applies a staged update, then removes itself.
          _apply = '<APPLY_SCRIPT>'
          File.delete(__FILE__) rescue nil
          if File.file?(_apply)
            begin
              require _apply
            rescue StandardError => e
              puts "[Dirory] update loader: #{e.class}: #{e.message}"
            end
          end
        RUBY
        # Fill in the constant after the heredoc so the quoting stays simple.
        File.write(loader, File.read(loader, encoding: 'UTF-8').gsub('<APPLY_SCRIPT>', APPLY_SCRIPT), encoding: 'UTF-8')
        true
      rescue StandardError => e
        puts "[Dirory] could not write update loader: #{e.message}"
        false
      end
    end
  end
end
