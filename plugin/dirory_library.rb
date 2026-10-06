require 'sketchup.rb'
require 'extensions.rb'

module Dirory
  module Library
    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('Dirory', File.join(File.dirname(__FILE__), 'dirory_library', 'main.rb'))
      ext.description = 'Browse and insert 3D models and materials from your local Dirory product library.'
      ext.version     = '0.9.5'
      ext.creator     = 'Dirory'
      ext.copyright   = '2026'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
