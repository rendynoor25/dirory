require 'sketchup.rb'
require 'extensions.rb'

module Dirory
  module Library
    # The registered extension object. Cloud needs it for UI::Notification
    # (the update popup), which takes a SketchupExtension in its constructor.
    class << self
      attr_accessor :extension
    end

    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('Dirory', File.join(File.dirname(__FILE__), 'dirory_library', 'main.rb'))
      ext.description = 'Browse the Dirory product library inside SketchUp: search, insert models and paint materials from real Indonesian brands.'
      ext.version     = '0.10.6'
      ext.creator     = 'Dirory'
      ext.copyright   = '2026'
      self.extension  = ext
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
