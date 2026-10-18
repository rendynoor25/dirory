require 'json'

# ----------------------------------------------------------------------
# Dirory UI translations.
#
# The panel is plain HTML/JS. The strings live in ui/i18n.json (shared with
# the Revit add-in) and are pushed into the panel as one JSON object
# (window.diroryI18n). Adding a language is one more entry in that file's
# "strings" and in SUPPORTED, with the same keys.
#
# Keys are grouped by area. `en` is the reference: any key missing from another
# language falls back to English, so a partial translation is always safe.
# ----------------------------------------------------------------------
module Dirory
  module Library
    module I18n
      SUPPORTED = {
        'en' => 'English',
        'id' => 'Bahasa Indonesia'
      }.freeze

      # The strings live in ui/i18n.json, shared with the Revit add-in
      # (Lang.cs), so both plugins speak the same Indonesian.
      FILE = File.join(__dir__, 'ui', 'i18n.json')

      TRANSLATIONS = begin
        JSON.parse(File.read(FILE, encoding: 'UTF-8'))['strings'].freeze
      rescue StandardError
        { 'en' => {} }.freeze
      end

      def self.supported
        SUPPORTED
      end

      def self.normalize(code)
        c = code.to_s.strip.downcase
        return 'id' if c.start_with?('id')  # id, id-ID, in-ID
        return 'en' if c.start_with?('en')
        SUPPORTED.key?(c) ? c : 'en'
      end

      # The whole dictionary for one language, English keys filled in.
      def self.dictionary(code)
        lang = normalize(code)
        base = TRANSLATIONS['en']
        return base if lang == 'en'
        base.merge(TRANSLATIONS[lang] || {})
      end
    end
  end
end
