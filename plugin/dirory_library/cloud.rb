require 'sketchup.rb'
require 'json'
require 'digest'
require 'fileutils'
require 'securerandom'

# ----------------------------------------------------------------------
# Dirory cloud layer (v0.5)
#
#   * Account  - "soft" sign-in (name + email). Browsing and search stay
#                anonymous; inserting, painting and quotes need an account.
#                The single seam is Cloud.signed_in? - when the backend's
#                device-code login exists, only that method changes.
#   * Outbox   - every message for the server is queued in a local JSON file
#                first, then sent in batches. Nothing is lost when offline or
#                when no server URL has been configured yet.
#   * Search misses - a search that returns 0 results across the WHOLE
#                library is sent to admin, so Dirory knows what is missing.
#   * Usage snapshot - a simple table of the Dirory items used in the open
#                SketchUp model, sent every few minutes, only when it changed.
#
# Wire format (POST <api_base_url>/events):
#   { install_id, user:{name,email,...}|null, plugin_version, su_version,
#     platform, events:[ { id, kind, ts, data } ] }
#   kinds: account | search_miss | usage_snapshot | quote_request
# ----------------------------------------------------------------------
module Dirory
  module Library
    module Cloud
      SECTION = 'DiroryLibrary'.freeze
      PLUGIN_VERSION = '0.5.2'.freeze

      # Leave empty until the backend exists; set it in
      # Extensions > Dirory > Connection Settings...
      DEFAULT_API_BASE_URL = ''.freeze

      FLUSH_INTERVAL_SECONDS = 60
      DEFAULT_SNAPSHOT_MINUTES = 5
      BATCH_SIZE = 50
      OUTBOX_LIMIT = 1000
      EMAIL_RE = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

      @started = false
      @sending = false
      @dirty = {}        # model guid => true when the model changed since last snapshot
      @last_hash = {}    # model guid => digest of the last snapshot we queued
      @watched = {}      # model guid => true once a ModelObserver is attached
      @last_send = nil
      @last_error = nil
      @last_snapshot_at = nil

      # --------------------------------------------------------------
      # Settings
      # --------------------------------------------------------------
      def self.read(key, default = '')
        Sketchup.read_default(SECTION, key, default)
      end

      def self.write(key, value)
        Sketchup.write_default(SECTION, key, value)
      end

      def self.install_id
        id = read('install_id', '').to_s
        if id.empty?
          id = SecureRandom.uuid
          write('install_id', id)
        end
        id
      end

      def self.api_base_url
        url = read('api_base_url', DEFAULT_API_BASE_URL).to_s.strip
        url.sub(%r{/+\z}, '')
      end

      def self.api_key
        read('api_key', '').to_s.strip
      end

      def self.configured?
        !api_base_url.empty?
      end

      def self.share_usage?
        read('share_usage', true) ? true : false
      end

      # v0.5.2 / UU 27/2022: the project title is its own consent, OFF by default.
      # A project title is often personal data (a client name, a site address)
      # while a product table and an anonymous search term are not, so a single
      # switch cannot lawfully cover both. See docs/PRIVACY.md section 5.2.
      #
      # Default when unset: false. `read` returns the default for an unwritten
      # key, and a returning v0.5.1 user has no 'share_project' key, so they are
      # opted out on upgrade rather than silently opted in.
      def self.share_project?
        read('share_project', false) ? true : false
      end

      def self.snapshot_minutes
        value = read('snapshot_minutes', DEFAULT_SNAPSHOT_MINUTES).to_i
        value < 1 ? DEFAULT_SNAPSHOT_MINUTES : value
      end

      # --------------------------------------------------------------
      # Account (soft sign-in)
      # --------------------------------------------------------------
      def self.signed_in?
        !read('account_email', '').to_s.empty?
      end

      def self.user
        return nil unless signed_in?
        {
          'name' => read('account_name', '').to_s,
          'email' => read('account_email', '').to_s,
          'phone' => read('account_phone', '').to_s,
          'firm' => read('account_firm', '').to_s
        }
      end

      def self.account_state(error = nil)
        u = user
        state = {
          'signedIn' => !u.nil?,
          'name' => u ? u['name'] : '',
          'email' => u ? u['email'] : '',
          'phone' => u ? u['phone'] : '',
          'firm' => u ? u['firm'] : '',
          'shareUsage' => share_usage?,
          'shareProject' => share_project?
        }
        state['error'] = error if error
        state
      end

      # Returns nil on success or an error message.
      def self.sign_in(data)
        name = data['name'].to_s.strip
        email = data['email'].to_s.strip.downcase
        return 'Please enter your name.' if name.empty?
        return 'Please enter a valid email address.' unless email =~ EMAIL_RE

        write('account_name', name)
        write('account_email', email)
        write('account_phone', data['phone'].to_s.strip)
        write('account_firm', data['firm'].to_s.strip)
        enqueue('account', { 'action' => 'sign_in' }, replace_key: 'account')
        @dirty.clear # re-send usage under the new identity
        @last_hash.clear
        nil
      end

      def self.sign_out
        enqueue('account', { 'action' => 'sign_out' }, replace_key: 'account')
        flush
        %w[account_name account_email account_phone account_firm].each { |k| write(k, '') }
      end

      def self.set_share_usage(on)
        write('share_usage', on ? true : false)
      end

      # Turning the project title on or off must take effect on the next
      # snapshot, so drop the "unchanged since last time" memo for every model
      # and clear the last sent digest. Otherwise a user who turns sharing on
      # while their file is open would wait for their next edit.
      def self.set_share_project(on)
        write('share_project', on ? true : false)
        @dirty.each_key { |guid| @dirty[guid] = true }
        @last_hash.clear
      end

      # Called by insert / paint / quote. Returns true when allowed; otherwise
      # asks the panel to show its sign-in form and returns false.
      def self.require_sign_in(dialog)
        return true if signed_in?
        if dialog
          dialog.execute_script('window.diroryNeedSignIn && window.diroryNeedSignIn();')
        else
          UI.messagebox('Please sign in to Dirory first: open the Dirory panel and use the account button.')
        end
        false
      end

      # --------------------------------------------------------------
      # Outbox (local JSON queue)
      # --------------------------------------------------------------
      def self.outbox_path
        dir = File.join(Dir.home, '.dirory')
        FileUtils.mkdir_p(dir)
        File.join(dir, 'outbox.json')
      end

      def self.load_outbox
        path = outbox_path
        return [] unless File.file?(path)
        list = JSON.parse(File.read(path, encoding: 'UTF-8'))
        list.is_a?(Array) ? list : []
      rescue StandardError
        []
      end

      def self.save_outbox(list)
        list = list.last(OUTBOX_LIMIT)
        tmp = outbox_path + '.tmp'
        File.write(tmp, JSON.generate(list), encoding: 'UTF-8')
        FileUtils.mv(tmp, outbox_path, force: true)
      rescue StandardError => e
        puts "[Dirory] could not write outbox: #{e.message}"
      end

      # replace_key: an unsent entry with the same kind + key is replaced, so
      # only the newest snapshot per model (and one account event) is kept.
      def self.enqueue(kind, data, replace_key: nil)
        list = load_outbox
        if replace_key
          list.reject! { |e| e['kind'] == kind && e['key'] == replace_key }
        end
        entry = {
          'id' => SecureRandom.uuid,
          'kind' => kind,
          'ts' => Time.now.utc.strftime('%Y-%m-%dT%H:%M:%SZ'),
          't' => Time.now.to_i,
          'data' => data
        }
        entry['key'] = replace_key if replace_key
        list << entry
        save_outbox(list)
        entry
      end

      def self.pending_count
        load_outbox.length
      end

      # --------------------------------------------------------------
      # Sending
      # --------------------------------------------------------------
      def self.envelope(entries)
        {
          'install_id' => install_id,
          'user' => user,
          'plugin_version' => PLUGIN_VERSION,
          'su_version' => Sketchup.version.to_s,
          'platform' => (RUBY_PLATFORM =~ /mswin|mingw/i ? 'win' : 'mac'),
          'events' => entries.map { |e| e.reject { |k, _| k == 't' || k == 'key' } }
        }
      end

      # Auth headers for the Edge Functions.
      #
      # Supabase now issues two key formats and they need different headers:
      #
      #   * New keys (`sb_publishable_...` / `sb_secret_...`) are plain strings,
      #     NOT JWTs. They must go on `apikey` ONLY. If they are also sent as
      #     `Authorization: Bearer`, Supabase tries to parse them as a JWT and
      #     answers "Invalid JWT".
      #   * Legacy keys (`eyJ...`) are JWTs and are accepted on both headers.
      #
      # So: always send `apikey`; add the Bearer header only for a legacy JWT.
      # Detection is by prefix (`eyJ` = base64url of `{"`) rather than by trying
      # one and retrying, which would double every request on failure.
      def self.request_headers
        headers = { 'Content-Type' => 'application/json' }
        key = api_key
        unless key.empty?
          headers['apikey'] = key
          headers['Authorization'] = "Bearer #{key}" if legacy_jwt_key?(key)
        end
        headers
      end

      # True for a legacy anon / service_role key (a JWT). False for the new
      # `sb_publishable_*` and `sb_secret_*` formats.
      def self.legacy_jwt_key?(key)
        key.to_s.start_with?('eyJ')
      end

      # Sends up to BATCH_SIZE queued entries. Asynchronous: SketchUp is never
      # blocked; on failure the entries simply stay queued for the next tick.
      def self.flush
        return false unless configured?
        return false if @sending
        unless defined?(Sketchup::Http::Request)
          @last_error = 'This SketchUp version has no Sketchup::Http (needs 2021+).'
          return false
        end
        batch = load_outbox.first(BATCH_SIZE)
        return false if batch.empty?

        @sending = true
        sent_ids = batch.map { |e| e['id'] }
        request = Sketchup::Http::Request.new("#{api_base_url}/events", Sketchup::Http::POST)
        request.headers = request_headers
        request.body = JSON.generate(envelope(batch))
        request.start do |_req, response|
          @sending = false
          code = response.status_code.to_i
          if code >= 200 && code < 300
            remaining = load_outbox.reject { |e| sent_ids.include?(e['id']) }
            save_outbox(remaining)
            @last_send = Time.now
            @last_error = nil
          else
            @last_error = "Server answered HTTP #{code}"
          end
        end
        true
      rescue StandardError => e
        @sending = false
        @last_error = "#{e.class}: #{e.message}"
        false
      end

      # --------------------------------------------------------------
      # Search misses: zero results across the whole library
      # --------------------------------------------------------------
      def self.normalize_query(text)
        text.to_s.downcase.gsub(/\s+/, ' ').strip
      end

      def self.record_search_miss(data)
        return unless share_usage?
        query = normalize_query(data['query'])
        return if query.length < 3 || query.length > 120

        tab = %w[all model material].include?(data['tab'].to_s) ? data['tab'].to_s : 'all'
        list = load_outbox
        now = Time.now.to_i

        # Already queued today for this query? Then do nothing.
        return if list.any? { |e| e['kind'] == 'search_miss' && e['data']['query'] == query }

        # A refinement of the previous unsent miss (typing on) replaces it.
        last = list.reverse.find { |e| e['kind'] == 'search_miss' }
        if last && now - last['t'].to_i < 60
          prev = last['data']['query'].to_s
          if query.start_with?(prev) || prev.start_with?(query)
            list.delete_if { |e| e['id'] == last['id'] }
            save_outbox(list)
          end
        end
        enqueue('search_miss', { 'query' => query, 'tab' => tab })
      end

      # --------------------------------------------------------------
      # Usage snapshot: simple table of Dirory items in the open model
      # --------------------------------------------------------------
      def self.usage_rows
        report = Dirory::Library.usage_report
        rows = []
        report['models'].each do |r|
          next unless r['count'].to_i > 0
          rows << { 'type' => 'model', 'asset' => r['id'], 'name' => r['name'],
                    'category' => r['category'], 'brand' => r['brand'],
                    'qty' => r['count'].to_i, 'faces' => 0, 'area_m2' => 0.0 }
        end
        report['materials'].each do |r|
          next unless r['faces'].to_i > 0
          rows << { 'type' => 'material', 'asset' => r['id'], 'name' => r['name'],
                    'category' => r['category'], 'brand' => r['brand'],
                    'qty' => 0, 'faces' => r['faces'].to_i, 'area_m2' => r['area_m2'].to_f }
        end
        rows
      end

      # Queue a snapshot of the active model. force: ignore the dirty flag
      # and the "unchanged" check (used by Send Now).
      def self.snapshot(force = false)
        return false unless share_usage?
        model = Sketchup.active_model
        return false unless model
        guid = model.guid.to_s
        return false if !force && @dirty.fetch(guid, true) == false

        rows = usage_rows
        @dirty[guid] = false
        digest = Digest::SHA1.hexdigest(JSON.generate(rows))
        previous = @last_hash[guid]
        return false if !force && digest == previous
        return false if rows.empty? && previous.nil? # never had anything: nothing to say

        @last_hash[guid] = digest
        @last_snapshot_at = Time.now
        enqueue('usage_snapshot', {
          'model_id' => guid,
          # v0.5.2: '' unless the architect opted in to sharing the project name.
          # The ingest function normalises an empty string to null, so an
          # opted-out user is indistinguishable from one who never set a title
          # (PRD section 11 privacy).
          'project' => share_project? ? model.title.to_s : '',
          'items' => rows,
          'totals' => {
            'models' => rows.sum { |r| r['qty'] },
            'area_m2' => rows.sum { |r| r['area_m2'] }.round(2)
          }
        }, replace_key: guid)
        true
      end

      # --------------------------------------------------------------
      # Quote requests (sent alongside the existing WhatsApp hand-off)
      # --------------------------------------------------------------
      def self.record_quote(brands, report)
        return unless share_usage?
        items = []
        report['models'].each do |r|
          next unless brands.include?(r['brand']) && r['count'].to_i > 0
          items << { 'type' => 'model', 'asset' => r['id'], 'name' => r['name'],
                     'brand' => r['brand'], 'qty' => r['count'].to_i, 'area_m2' => 0.0 }
        end
        report['materials'].each do |r|
          next unless brands.include?(r['brand']) && r['faces'].to_i > 0
          items << { 'type' => 'material', 'asset' => r['id'], 'name' => r['name'],
                     'brand' => r['brand'], 'qty' => 0, 'area_m2' => r['area_m2'].to_f }
        end
        return if items.empty?
        model = Sketchup.active_model
        enqueue('quote_request', {
          'model_id' => model ? model.guid.to_s : '',
          # A quote is a disclosure the user initiates, so the title travels when
          # they have opted in - the same switch as the snapshot. A user who kept
          # project sharing off does not leak the title merely by asking a price.
          'project' => share_project? && model ? model.title.to_s : '',
          'brands' => brands,
          'items' => items
        })
        flush
      end

      # --------------------------------------------------------------
      # Change tracking, so a big model is only re-scanned after an edit
      # --------------------------------------------------------------
      def self.mark_dirty(model)
        @dirty[model.guid.to_s] = true
      rescue StandardError
        nil
      end

      class ModelWatcher < Sketchup::ModelObserver
        def onTransactionCommit(model)
          Dirory::Library::Cloud.mark_dirty(model)
        end

        def onTransactionUndo(model)
          Dirory::Library::Cloud.mark_dirty(model)
        end

        def onTransactionRedo(model)
          Dirory::Library::Cloud.mark_dirty(model)
        end
      end

      class AppWatcher < Sketchup::AppObserver
        def expectsStartupModelNotifications
          true
        end

        def onNewModel(model)
          Dirory::Library::Cloud.watch(model)
        end

        def onOpenModel(model)
          Dirory::Library::Cloud.watch(model)
        end
      end

      def self.watch(model)
        return unless model
        guid = model.guid.to_s
        return if @watched[guid]
        model.add_observer(ModelWatcher.new)
        @watched[guid] = true
        @dirty[guid] = true
      rescue StandardError => e
        puts "[Dirory] could not watch model: #{e.message}"
      end

      # --------------------------------------------------------------
      # Timers
      # --------------------------------------------------------------
      def self.safely
        yield
      rescue StandardError => e
        @last_error = "#{e.class}: #{e.message}"
        puts "[Dirory] cloud error: #{e.class}: #{e.message}"
      end

      def self.start
        return if @started
        @started = true
        watch(Sketchup.active_model)
        Sketchup.add_observer(AppWatcher.new)
        UI.start_timer(FLUSH_INTERVAL_SECONDS, true) { safely { flush } }
        UI.start_timer(snapshot_minutes * 60, true) { safely { snapshot } }
      end

      # --------------------------------------------------------------
      # Menu helpers
      # --------------------------------------------------------------
      def self.send_now
        safely do
          snapshot(true)
          ok = flush
          UI.messagebox(ok ? 'Dirory: sending queued data now.' : status_text)
        end
      end

      def self.status_text
        lines = []
        lines << "Server: #{configured? ? api_base_url : '(not set - data stays queued on this computer)'}"
        lines << "Queued messages: #{pending_count}"
        lines << "Last successful send: #{@last_send ? @last_send.strftime('%Y-%m-%d %H:%M:%S') : 'never'}"
        lines << "Last usage snapshot: #{@last_snapshot_at ? @last_snapshot_at.strftime('%Y-%m-%d %H:%M:%S') : 'never'}"
        lines << "Snapshot every: #{snapshot_minutes} min (only when the model changed)"
        lines << "Share usage: #{share_usage? ? 'on' : 'off'}"
        lines << "Share project name: #{share_project? ? 'on' : 'off'}"
        lines << "Signed in: #{signed_in? ? user['email'] : 'no'}"
        lines << "Last error: #{@last_error}" if @last_error
        lines.join("\n")
      end

      def self.show_status
        UI.messagebox(status_text)
      end

      def self.connection_settings
        prompts = ['API base URL', 'API key (optional)', 'Snapshot every (minutes)']
        defaults = [api_base_url, api_key, snapshot_minutes.to_s]
        result = UI.inputbox(prompts, defaults, 'Dirory connection settings')
        return unless result
        write('api_base_url', result[0].to_s.strip)
        write('api_key', result[1].to_s.strip)
        minutes = result[2].to_i
        write('snapshot_minutes', minutes < 1 ? DEFAULT_SNAPSHOT_MINUTES : minutes)
        UI.messagebox("Saved. Restart SketchUp for a new snapshot interval to apply.\n\n#{status_text}")
      end
    end
  end
end
