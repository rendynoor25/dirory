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
      PLUGIN_VERSION = '0.9.4'.freeze

      # M6: cloud catalogue and signed asset cache live under ~/.dirory.
      CACHE_ROOT = File.join(Dir.home, '.dirory').freeze
      SIGNED_URL_REFRESH_SECONDS = 3600

      # Leave empty until the backend exists; set it in
      # Extensions > Dirory > Connection Settings...
      # Zero-configuration defaults. A normal user installs the RBZ and it just
      # works: the cloud endpoint and the public (publishable) key are baked in
      # here, so nobody has to open Connection Settings.
      #
      # The publishable key is designed to be public â€” it ships in every browser
      # bundle of the website too. It is NOT a secret. Never put the
      # service-role/secret key here.
      DEFAULT_API_BASE_URL = 'https://ajlmncbzufagplbaaukv.supabase.co/functions/v1'.freeze
      DEFAULT_API_KEY = 'sb_publishable_JIpzGVjnwobUxaGbhBEsHg_0Lfu_QPs'.freeze

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
      @inflight = []     # keeps in-flight HTTP requests alive (see new_request)

      # --------------------------------------------------------------
      # HTTP requests
      #
      # Sketchup::Http::Request is asynchronous: a local variable holding the
      # request is garbage-collected the moment the calling method returns, so
      # the response callback never fires ("Ruby never called back"). Every
      # request must be kept reachable. This helper stores each one in
      # @inflight and drops it when its callback completes.
      #
      # The official examples all keep the request in an instance variable for
      # exactly this reason. This bit the M6 catalogue fetch â€” the panel opened,
      # no response ever arrived, and it showed the "didn't hear back" message.
      # --------------------------------------------------------------
      def self.new_request(url, method = Sketchup::Http::GET)
        request = Sketchup::Http::Request.new(url, method)
        @inflight << request
        @inflight.shift while @inflight.length > 20
        request
      end

      def self.release_request(request)
        @inflight.delete(request)
      rescue StandardError
        nil
      end

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
        read('api_key', DEFAULT_API_KEY).to_s.strip
      end

      def self.configured?
        !api_base_url.empty?
      end

      # --------------------------------------------------------------
      # Language (Settings)
      # --------------------------------------------------------------
      def self.language
        Dirory::Library::I18n.normalize(read('language', 'en'))
      end

      def self.set_language(code)
        write('language', Dirory::Library::I18n.normalize(code))
      end

      # The whole dictionary for the panel's current language.
      def self.dictionary
        Dirory::Library::I18n.dictionary(language)
      end

      # --------------------------------------------------------------
      # Update check
      #
      # The plugin asks what version is published and compares it with its own.
      # The result is pushed to the panel, which decides whether to show the
      # Update badge.
      # --------------------------------------------------------------
      @latest_version = nil
      @update_checked = false

      def self.check_for_update(dialog = nil)
        return unless configured? && defined?(Sketchup::Http::Request)
        request = new_request("#{api_base_url}/plugin-release", Sketchup::Http::GET)
        request.headers = request_headers
        request.start do |_req, response|
          release_request(request)
          begin
            if response.status_code.to_i == 200
              data = (JSON.parse(response.body.to_s) rescue {})
              @latest_version = data['version'].to_s
              @update_checked = true
              push_update_state(dialog)
            end
          rescue StandardError => e
            puts "[Dirory] update check failed: #{e.message}"
          end
        end
      end

      def self.update_available?
        !@latest_version.to_s.empty? &&
          Dirory::Library::Updater.newer?(@latest_version, PLUGIN_VERSION)
      end

      def self.update_state
        {
          'installed' => PLUGIN_VERSION,
          'latest' => @latest_version.to_s,
          'available' => update_available?,
          'checked' => @update_checked,
          'staged' => Dirory::Library::Updater.staged?
        }
      end

      def self.push_update_state(dialog = nil)
        target = dialog || @sign_in_dialog
        return unless target
        target.execute_script("window.diroryUpdate && window.diroryUpdate(#{update_state.to_json});")
      rescue StandardError
        nil
      end

      # Download and stage the published archive. Yields nothing; the panel is
      # told the outcome via window.diroryUpdateResult.
      def self.download_update(dialog)
        unless configured? && signed_in? && defined?(Sketchup::Http::Request)
          push_update_result(dialog, false, 'sign in first')
          return
        end
        request = new_request("#{api_base_url}/plugin-release/download", Sketchup::Http::GET)
        request.headers = request_headers
        request.start do |_req, response|
          release_request(request)
          begin
            code = response.status_code.to_i
            if code >= 200 && code < 300
              body = response.body
              ok = stage_update_bytes(body)
              push_update_result(dialog, ok, ok ? nil : 'could not write the staged update')
            elsif code == 401
              push_update_result(dialog, false, 'sign in first')
            else
              push_update_result(dialog, false, "HTTP #{code}")
            end
          rescue StandardError => e
            push_update_result(dialog, false, e.message)
          end
        end
      end

      def self.stage_update_bytes(bytes)
        Dirory::Library::Updater.pending_dir
        File.binwrite(Dirory::Library::Updater::STAGED_RBZ, bytes)
        Dirory::Library::Updater.stage_from_file(Dirory::Library::Updater::STAGED_RBZ)
      end

      def self.push_update_result(dialog, ok, error)
        return unless dialog
        dialog.execute_script(
          "window.diroryUpdateResult(#{ { ok: ok, error: error, restart_required: ok }.to_json });"
        )
      rescue StandardError
        nil
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
      # Account â€” verified device-code login (M6 / FR-A4)
      #
      # The plugin no longer trusts a typed name + email. It starts a device
      # login, opens the browser, polls until the architect approves, and stores
      # the opaque token the server issues. `signed_in?` is still the single gate.
      # --------------------------------------------------------------
      def self.plugin_token
        read('plugin_token', '').to_s
      end

      def self.signed_in?
        !plugin_token.empty?
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
          'cloudConfigured' => configured?,
          'name' => u ? u['name'] : '',
          'email' => u ? u['email'] : '',
          'phone' => u ? u['phone'] : '',
          'firm' => u ? u['firm'] : '',
          'shareUsage' => share_usage?,
          'shareProject' => share_project?,
          'devicePending' => !@pending_device.nil?,
          'deviceStatus' => @poll_info.to_s,
          'deviceUserCode' => @pending_device ? @pending_device['user_code'].to_s : '',
          'verificationUrl' => @pending_device ? @pending_device['verification_url'].to_s : ''
        }
        state['error'] = error if error
        state
      end

      # Menu entry: open the panel and start the browser sign-in. The panel owns
      # the dialog, so it starts the flow for us.
      def self.begin_sign_in
        Dirory::Library.sign_in_from_menu
      rescue StandardError => e
        UI.messagebox("Dirory could not start sign-in: #{e.message}")
      end

      # Kick off the browser sign-in. Returns an error message, or nil while the
      # flow runs in the background. The panel shows the returned user code.
      def self.sign_in_start(dialog)
        return 'Set the server URL first (Extensions > Dirory > Connection Settings).' unless configured?
        unless defined?(Sketchup::Http::Request)
          return 'This SketchUp version has no Sketchup::Http (needs 2021+).'
        end
        @sign_in_dialog = dialog
        @pending_device = { 'user_code' => '', 'verification_url' => '' }

        request = new_request("#{api_base_url}/auth-device/start", Sketchup::Http::POST)
        request.headers = base_headers
        request.body = JSON.generate(
          'install_id' => install_id,
          'plugin_version' => PLUGIN_VERSION,
          'platform' => (RUBY_PLATFORM =~ /mswin|mingw/i ? 'win' : 'mac')
        )
        request.start do |_req, response|
          release_request(request)
          safely do
            code = response.status_code.to_i
            body = (JSON.parse(response.body.to_s) rescue {})
            if code >= 200 && code < 300 && body['device_code'] && body['user_code']
              @pending_device = body
              @poll_info = ''
              open_sign_in_page
              Dirory::Library.push_account
              start_device_poll
            else
              @pending_device = nil
              Dirory::Library.push_account("Could not start sign-in (HTTP #{code}). Please try again.")
            end
          end
        end
        nil
      end

      # The verification page is on our own site. We deliberately do NOT force a
      # provider: an earlier build appended "&provider=google", which fails with
      # "provider is not enabled" whenever Google OAuth is not configured on the
      # Supabase project â€” and it hid the email-link option entirely. The page
      # now offers whatever is actually available (Google if enabled, plus the
      # email link, which always works).
      def self.sign_in_url
        return nil unless @pending_device
        url = (@pending_device['verification_url_complete'] || @pending_device['verification_url']).to_s
        return nil if url.empty?
        url
      end

      def self.open_sign_in_page
        url = sign_in_url
        UI.openURL(url) if url
      end

      def self.cancel_sign_in
        @pending_device = nil
        @poll_info = ''
        stop_device_poll
      end

      def self.start_device_poll
        stop_device_poll
        @device_poll_ticks = 0
        @device_poll_timer = UI.start_timer(5, true) do
          safely { device_poll_tick }
        end
      end

      def self.stop_device_poll
        if @device_poll_timer
          begin
            UI.stop_timer(@device_poll_timer)
          rescue StandardError
            nil
          end
          @device_poll_timer = nil
        end
      end

      def self.device_poll_tick
        return unless @pending_device
        @device_poll_ticks = @device_poll_ticks.to_i + 1
        if @device_poll_ticks > 180 # 15 minutes at 5 s
          @pending_device = nil
          stop_device_poll
          Dirory::Library.push_account('Sign-in timed out. Please try again.')
          return
        end
        request = new_request("#{api_base_url}/auth-device/poll", Sketchup::Http::POST)
        request.headers = base_headers
        request.body = JSON.generate(
          'device_code' => @pending_device['device_code'],
          'install_id' => install_id,
          'plugin_version' => PLUGIN_VERSION
        )
        request.start do |_req, response|
          release_request(request)
          safely { handle_device_poll(response) }
        end
      end

      def self.handle_device_poll(response)
        code = response.status_code.to_i
        body = (JSON.parse(response.body.to_s) rescue {})
        body = {} unless body.is_a?(Hash)
        info = "HTTP #{code}#{body['status'] ? ' ' + body['status'].to_s : (body['error'] ? ' ' + body['error'].to_s : '')}"
        puts "[Dirory] sign-in poll: #{info}"
        if info != @poll_info
          @poll_info = info
          Dirory::Library.push_account if @pending_device
        end
        case body['status']
        when 'approved'
          write('plugin_token', body['token'].to_s)
          u = body['user'] || {}
          write('account_name', u['name'].to_s)
          write('account_email', u['email'].to_s)
          @pending_device = nil
          stop_device_poll
          # A verified identity means a fresh send: usage under the account and
          # favourites that follow the user across computers (FR-A22).
          @dirty.each_key { |guid| @dirty[guid] = true }
          @last_hash.clear
          sync_favourites_pull
          Dirory::Library.push_account
          Dirory::Library.signed_in_now
        when 'expired', 'denied'
          @pending_device = nil
          stop_device_poll
          Dirory::Library.push_account('Sign-in was not completed. Please try again.')
        end
      end

      def self.sign_out
        token = plugin_token
        result = nil
        if !token.empty? && configured? && defined?(Sketchup::Http::Request)
          request = new_request("#{api_base_url}/auth-device/revoke", Sketchup::Http::POST)
          request.headers = request_headers
          request.body = '{}'
          request.start do |_req, _response|
            release_request(request)
            nil
          end
          result = true
        end
        @pending_device = nil
        stop_device_poll
        %w[plugin_token account_name account_email account_phone account_firm].each { |k| write(k, '') }
        result
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
      def self.require_sign_in(dialog, action = 'load')
        # Without a server URL there is no account system to sign in to, so a
        # local library stays usable (otherwise every card click is blocked by
        # a sign-in that can never complete).
        return true if !configured? || signed_in?
        payload = { 'action' => action.to_s }.to_json
        if dialog
          dialog.execute_script("window.diroryNeedSignIn && window.diroryNeedSignIn(#{payload});")
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
      # Apikey only; no bearer. Used for the unauthenticated device sign-in calls.
      def self.base_headers
        headers = { 'Content-Type' => 'application/json' }
        key = api_key
        headers['apikey'] = key unless key.empty?
        headers
      end

      # Adds the plugin's own opaque token as Bearer when signed in. That token
      # is what the M6 Edge Functions read; the apikey is still sent so Supabase
      # knows which project the request belongs to. For legacy JWT anon keys the
      # bearer is the key itself (M6 tokens always win).
      def self.request_headers
        headers = base_headers
        token = plugin_token
        if !token.empty?
          headers['Authorization'] = "Bearer #{token}"
        elsif legacy_jwt_key?(api_key)
          headers['Authorization'] = "Bearer #{api_key}"
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
        request = new_request("#{api_base_url}/events", Sketchup::Http::POST)
        request.headers = request_headers
        request.body = JSON.generate(envelope(batch))
        request.start do |_req, response|
          release_request(request)
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
      # M6 cloud catalogue (FR-A7, FR-A10)
      #
      # The scan_library source is replaced by this fetch. The item hash shape is
      # identical; the panel does not change. The last good response is cached on
      # disk so a later launch works offline.
      # --------------------------------------------------------------
      def self.catalog_cache_path
        FileUtils.mkdir_p(CACHE_ROOT)
        File.join(CACHE_ROOT, 'catalog.json')
      end

      def self.load_cached_catalog
        path = catalog_cache_path
        return nil unless File.file?(path)
        JSON.parse(File.read(path, encoding: 'UTF-8'))
      rescue StandardError
        nil
      end

      def self.save_cached_catalog(data)
        path = catalog_cache_path
        tmp = "#{path}.tmp"
        File.write(tmp, JSON.generate(data), encoding: 'UTF-8')
        FileUtils.mv(tmp, path, force: true)
      rescue StandardError => e
        puts "[Dirory] could not cache the catalogue: #{e.message}"
      end

      # Fetch the cloud catalogue, then render it in the panel. Falls back to the
      # cached copy, and finally to the local folder scan.
      #
      # The panel shows a "didn't hear back" message if Ruby never renders, so
      # every path here MUST end in a render call. Errors are reported to the
      # panel rather than swallowed by `safely` (which only logs).
      def self.fetch_catalog
        unless configured?
          Dirory::Library.render_from_scan
          return
        end
        unless defined?(Sketchup::Http::Request)
          Dirory::Library.render_catalog(load_cached_catalog, 'This SketchUp cannot download the cloud catalogue.')
          return
        end

        begin
          request = new_request("#{api_base_url}/catalog", Sketchup::Http::GET)
          request.headers = request_headers
          request.start do |_req, response|
            release_request(request)
            begin
              code = response.status_code.to_i
              if code >= 200 && code < 300
                data = (JSON.parse(response.body.to_s) rescue nil)
                if data && data['items']
                  save_cached_catalog(data)
                  Dirory::Library.render_catalog(data)
                else
                  Dirory::Library.render_catalog(load_cached_catalog, 'The catalogue response was not valid.')
                end
              else
                Dirory::Library.render_catalog(load_cached_catalog, "Catalogue server answered HTTP #{code}")
              end
            rescue StandardError => e
              # Never leave the panel waiting: show the error on the panel.
              @last_error = "#{e.class}: #{e.message}"
              Dirory::Library.render_catalog(load_cached_catalog, "Catalogue error: #{e.message}")
            end
          end
        rescue StandardError => e
          @last_error = "#{e.class}: #{e.message}"
          Dirory::Library.render_catalog(
            load_cached_catalog,
            "Could not reach the server (#{e.message}). Showing cached/local items."
          )
        end
      end

      # --------------------------------------------------------------
      # M6 signed downloads (FR-A11)
      #
      # The private buckets cannot be read directly, so the plugin asks
      # /download/<asset_id> for a short-lived URL, then caches the file under
      # ~/.dirory/cache/<asset_id>/<version>/ and inserts/paints from there.
      # --------------------------------------------------------------
      def self.cache_root
        dir = File.join(CACHE_ROOT, 'cache')
        FileUtils.mkdir_p(dir)
        dir
      end

      def self.cached_asset_path(asset_id, version, file_name)
        dir = File.join(cache_root, asset_id.to_s, version.to_s)
        FileUtils.mkdir_p(dir)
        File.join(dir, file_name.to_s)
      end

      def self.find_cached_asset(asset_id, version)
        dir = File.join(cache_root, asset_id.to_s, version.to_s)
        return nil unless Dir.exist?(dir)
        Dir.glob(File.join(dir, '*')).find do |p|
          next false unless File.file?(p)
          if File.size(p) > 0
            true
          else
            File.delete(p) rescue nil # an empty file is a failed download
            false
          end
        end
      end

      # Yields (local_path, nil) when ready, or (nil, message) on failure.
      def self.download_asset(data)
        asset_id = data['asset_id'].to_s
        version = (data['version'] || 1).to_i
        unless configured? && signed_in? && defined?(Sketchup::Http::Request)
          yield(nil, 'Sign in to Dirory and set the server URL before downloading.')
          return
        end
        cached = find_cached_asset(asset_id, version)
        if cached
          yield(cached, nil)
          return
        end
        request = new_request("#{api_base_url}/download/#{asset_id}", Sketchup::Http::GET)
        request.headers = request_headers
        request.start do |_req, response|
          release_request(request)
          begin
            code = response.status_code.to_i
            if code >= 200 && code < 300
              meta = (JSON.parse(response.body.to_s) rescue nil)
              if meta && meta['url'] && meta['file_name']
                fetch_signed_file(meta, asset_id, version) { |path, err| yield(path, err) }
              else
                yield(nil, 'The server did not return a download link.')
              end
            elsif code == 401
              yield(nil, 'Please sign in to Dirory to download this item.')
            else
              yield(nil, "Download server answered HTTP #{code}")
            end
          rescue StandardError => e
            # Never swallow this: a silent failure leaves the click doing nothing.
            @last_error = "#{e.class}: #{e.message}"
            yield(nil, "Download failed: #{e.message}")
          end
        end
      end

      def self.fetch_signed_file(meta, asset_id, version)
        file_name = File.basename(meta['file_name'].to_s)
        dest = cached_asset_path(asset_id, version, file_name)
        request = new_request(meta['url'].to_s, Sketchup::Http::GET)
        request.start do |_req, response|
          release_request(request)
          begin
            code = response.status_code.to_i
            if code >= 200 && code < 300
              body = response.body
              if body.nil? || body.empty?
                yield(nil, 'The downloaded file was empty.')
              else
                File.binwrite(dest, body)
                yield(dest, nil)
              end
            else
              yield(nil, "File download answered HTTP #{code}")
            end
          rescue StandardError => e
            yield(nil, "Could not save the file: #{e.message}")
          end
        end
      rescue StandardError => e
        yield(nil, e.message)
      end

      # --------------------------------------------------------------
      # M6 favourites sync (FR-A22 / Q15)
      # --------------------------------------------------------------
      def self.sync_favourites_pull
        return unless configured? && signed_in? && defined?(Sketchup::Http::Request)
        request = new_request("#{api_base_url}/favourites", Sketchup::Http::GET)
        request.headers = request_headers
        request.start do |_req, response|
          release_request(request)
          safely do
            if response.status_code.to_i == 200
              data = (JSON.parse(response.body.to_s) rescue {})
              Dirory::Library.merge_server_favourites(data)
            end
          end
        end
      end

      def self.push_favourites(favourites, recent)
        return unless configured? && signed_in? && defined?(Sketchup::Http::Request)
        request = new_request("#{api_base_url}/favourites", Sketchup::Http::POST)
        request.headers = request_headers
        request.body = JSON.generate('favourites' => favourites, 'recent' => recent)
        request.start do |_req, _response|
          release_request(request)
          nil
        end
      rescue StandardError => e
        puts "[Dirory] favourite sync failed: #{e.message}"
      end

      # --------------------------------------------------------------
      # M6 server-side quote with consent (FR-A20)
      # --------------------------------------------------------------
      def self.post_quote(payload, report)
        items = quote_items(payload, report)
        return false if items.empty?
        return false unless configured? && signed_in? && defined?(Sketchup::Http::Request)
        request = new_request("#{api_base_url}/quotes", Sketchup::Http::POST)
        request.headers = request_headers
        request.body = JSON.generate(
          'install_id' => install_id,
          'project_name' => payload['project_name'].to_s,
          'city' => payload['city'].to_s,
          'timeline' => payload['timeline'].to_s,
          'note' => payload['note'].to_s,
          'phone_shared' => payload['phone_shared'] ? true : false,
          'brands' => payload['brands'] || [],
          'items' => items
        )
        request.start do |_req, response|
          release_request(request)
          safely do
            ok = response.status_code.to_i >= 200 && response.status_code.to_i < 300
            Dirory::Library.quote_result(ok, ok ? nil : "HTTP #{response.status_code}")
          end
        end
        true
      end

      def self.quote_items(payload, report)
        brands = Array(payload['brands']).map(&:to_s)
        items = []
        report['models'].each do |r|
          next unless brands.include?(r['brand']) && r['count'].to_i > 0
          items << { 'asset_id' => uuid_like?(r['id']), 'brand' => r['brand'], 'type' => 'model',
                     'name' => r['name'], 'qty' => r['count'].to_i, 'area_m2' => 0.0 }
        end
        report['materials'].each do |r|
          next unless brands.include?(r['brand']) && r['faces'].to_i > 0
          items << { 'asset_id' => uuid_like?(r['id']), 'brand' => r['brand'], 'type' => 'material',
                     'name' => r['name'], 'qty' => 0, 'area_m2' => r['area_m2'].to_f }
        end
        items
      end

      # An asset id is a UUID; a legacy local-library key is not.
      def self.uuid_like?(value)
        str = value.to_s
        str =~ /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i ? str : nil
      end


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

      # Menu action: make one real request to <server>/catalog and report
      # exactly what happened. This exists to diagnose the silent `HTTP 0`
      # ("no response") failure, which has several possible causes that a plain
      # status code cannot distinguish: an unreachable URL, a TLS problem, or an
      # empty/mistyped base URL or key.
      def self.test_connection
        lines = []
        lines << "API base URL: #{configured? ? api_base_url : '(empty)'}"
        lines << "API key: #{api_key.empty? ? '(empty)' : "set (#{api_key[0, 6]}â€¦, #{api_key.length} chars)"}"
        lines << "Plugin version: #{PLUGIN_VERSION}"
        lines << "SketchUp: #{Sketchup.version}"
        lines << "Sketchup::Http available: #{defined?(Sketchup::Http::Request) ? 'yes' : 'NO (needs SketchUp 2021+)'}"

        unless configured?
          lines << ''
          lines << 'Set the API base URL first, then run this again.'
          UI.messagebox(lines.join("\n"))
          return
        end
        unless defined?(Sketchup::Http::Request)
          UI.messagebox(lines.join("\n"))
          return
        end

        url = "#{api_base_url}/catalog"
        lines << "Request: GET #{url}"
        lines << 'Waiting for the serverâ€¦'

        begin
          request = new_request(url, Sketchup::Http::GET)
          request.headers = request_headers
          request.start do |_req, response|
            release_request(request)
            code = response.status_code.to_i
            body_len = response.body.to_s.length
            lines << ''
            if code == 0
              lines << 'Result: HTTP 0 â€” no response was received.'
              lines << 'This means the request never completed. Common causes:'
              lines << '  Â· the base URL is not reachable from this computer'
              lines << '  Â· a TLS/network problem inside SketchUp'
              lines << '  Â· the base URL must be https:// and end at /functions/v1'
              lines << "Open this in a browser to check: #{url}"
            elsif code >= 200 && code < 300
              lines << "Result: HTTP #{code} â€” the server answered correctly."
              lines << "Response size: #{body_len} bytes"
              lines << 'Connection is working. Try signing in again.'
            else
              lines << "Result: HTTP #{code}"
              lines << "Response: #{response.body.to_s[0, 300]}"
            end
            UI.messagebox(lines.join("\n"))
          end
        rescue StandardError => e
          lines << "Exception: #{e.class}: #{e.message}"
          UI.messagebox(lines.join("\n"))
        end
      end

      def self.connection_settings
        prompts = ['API base URL', 'API key (optional)', 'Snapshot every (minutes)']
        defaults = [api_base_url, api_key, snapshot_minutes.to_s]
        result = UI.inputbox(prompts, defaults, 'Dirory connection settings')
        return unless result
        url = result[0].to_s.strip
        # A very common mistake: the base URL must include https:// and end at
        # /functions/v1. Normalise the obvious cases instead of failing later.
        if !url.empty? && !url.match?(%r{\Ahttps?://}i)
          url = "https://#{url}"
        end
        url = url.sub(%r{/+\z}, '')
        url = url.sub(%r{/events\z}i, '') # someone pasted the /events endpoint
        write('api_base_url', url)
        write('api_key', result[1].to_s.strip)
        minutes = result[2].to_i
        write('snapshot_minutes', minutes < 1 ? DEFAULT_SNAPSHOT_MINUTES : minutes)
        UI.messagebox("Saved.\n\n#{status_text}\n\nTip: 'Test Connection' shows whether the server is reachable.")
      end
    end
  end
end
