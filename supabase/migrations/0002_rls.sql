-- Dirory — Row Level Security (PRD §9)
-- 0002_rls.sql. Depends on 0001_schema.sql.

-- ---------------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER so they can read the tables they guard
-- without tripping RLS (avoids infinite recursion in policies).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_vendor_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select vendor_id from public.vendor_members where profile_id = auth.uid();
$$;

create or replace function public.is_vendor_member(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vendor_members
    where vendor_id = target and profile_id = auth.uid()
  );
$$;

create or replace function public.is_vendor_editor(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vendor_members
    where vendor_id = target and profile_id = auth.uid() and role in ('owner','editor')
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.installs              enable row level security;
alter table public.vendors               enable row level security;
alter table public.vendor_members        enable row level security;
alter table public.categories            enable row level security;
alter table public.assets                enable row level security;
alter table public.asset_versions        enable row level security;
alter table public.plans                 enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.invoices              enable row level security;
alter table public.ingest_log            enable row level security;
alter table public.search_misses         enable row level security;
alter table public.missing_requests      enable row level security;
alter table public.usage_snapshots       enable row level security;
alter table public.usage_snapshot_items  enable row level security;
alter table public.usage_history         enable row level security;
alter table public.daily_asset_usage     enable row level security;
alter table public.quote_requests        enable row level security;
alter table public.audit_log             enable row level security;
alter table public.favourites            enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
-- A signed-in user may create their own profile row (role forced to architect by trigger).
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- installs  (plugin, via service role; admins read)
-- ---------------------------------------------------------------------------
create policy installs_admin_read on public.installs
  for select using (public.is_admin());
create policy installs_self_read on public.installs
  for select using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- favourites (FR-A22) : strictly per user. Nobody else may read them, and
-- vendors certainly cannot: a favourite is a private signal about one architect.
-- The plugin writes them through the /events ingest (service role) until M6.
-- ---------------------------------------------------------------------------
create policy favourites_self_read on public.favourites
  for select using (profile_id = auth.uid() or public.is_admin());
create policy favourites_self_write on public.favourites
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy favourites_admin on public.favourites
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
-- Public (incl. anon plugin) may read approved/suspended-but-visible vendors.
create policy vendors_public_read on public.vendors
  for select using (
    public.vendor_is_visible(vendors)
    or public.is_admin()
    or public.is_vendor_member(id)
  );
create policy vendors_admin_write on public.vendors
  for all using (public.is_admin()) with check (public.is_admin());
-- A prospective vendor can create its own pending vendor row.
create policy vendors_self_insert on public.vendors
  for insert with check (auth.uid() is not null and is_platform = false and status = 'pending');
create policy vendors_owner_update on public.vendors
  for update using (public.is_vendor_editor(id)) with check (public.is_vendor_editor(id));

-- ---------------------------------------------------------------------------
-- vendor_members
-- ---------------------------------------------------------------------------
create policy vendor_members_read on public.vendor_members
  for select using (public.is_admin() or public.is_vendor_member(vendor_id));
create policy vendor_members_admin on public.vendor_members
  for all using (public.is_admin()) with check (public.is_admin());
-- Self-service registration: a user may claim ownership of the pending vendor
-- row they just created (before any member exists).
create policy vendor_members_self_join on public.vendor_members
  for insert with check (
    profile_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.status = 'pending' and not v.is_platform
    )
  );
create policy vendor_members_owner on public.vendor_members
  for all using (
    public.is_vendor_member(vendor_id)
    and exists (select 1 from public.vendor_members m
                where m.vendor_id = vendor_members.vendor_id
                  and m.profile_id = auth.uid() and m.role = 'owner')
  ) with check (
    exists (select 1 from public.vendor_members m
            where m.vendor_id = vendor_members.vendor_id
              and m.profile_id = auth.uid() and m.role = 'owner')
  );

-- ---------------------------------------------------------------------------
-- categories : world-readable, admin-writable
-- ---------------------------------------------------------------------------
create policy categories_read on public.categories
  for select using (true);
create policy categories_admin on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- assets : architects read approved assets of visible vendors; vendors own theirs
-- ---------------------------------------------------------------------------
create policy assets_public_read on public.assets
  for select using (
    public.is_admin()
    or public.is_vendor_member(vendor_id)
    or (
      status = 'approved'
      and exists (select 1 from public.vendors v
                  where v.id = assets.vendor_id and public.vendor_is_visible(v))
    )
  );
create policy assets_vendor_write on public.assets
  for all using (public.is_vendor_editor(vendor_id)) with check (public.is_vendor_editor(vendor_id));
create policy assets_admin_all on public.assets
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- asset_versions : vendors manage their own; architects read approved ones
-- ---------------------------------------------------------------------------
create policy asset_versions_read on public.asset_versions
  for select using (
    public.is_admin()
    or exists (select 1 from public.assets a
               where a.id = asset_versions.asset_id
                 and (public.is_vendor_member(a.vendor_id)
                      or (asset_versions.review_status = 'approved'
                          and a.status = 'approved'
                          and exists (select 1 from public.vendors v
                                      where v.id = a.vendor_id and public.vendor_is_visible(v)))))
  );
create policy asset_versions_vendor_write on public.asset_versions
  for all using (
    exists (select 1 from public.assets a
            where a.id = asset_versions.asset_id and public.is_vendor_editor(a.vendor_id))
  ) with check (
    exists (select 1 from public.assets a
            where a.id = asset_versions.asset_id and public.is_vendor_editor(a.vendor_id))
  );
create policy asset_versions_admin on public.asset_versions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- plans : public read, admin write
-- ---------------------------------------------------------------------------
create policy plans_read on public.plans for select using (active or public.is_admin());
create policy plans_admin on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- subscriptions / invoices : vendor own rows, admin all
-- ---------------------------------------------------------------------------
create policy subscriptions_read on public.subscriptions
  for select using (public.is_admin() or public.is_vendor_member(vendor_id));
create policy subscriptions_admin on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

create policy invoices_read on public.invoices
  for select using (public.is_admin() or public.is_vendor_member(vendor_id));
create policy invoices_admin on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());
-- Vendor may attach proof of a manual transfer to its own unpaid invoice only.
create policy invoices_vendor_proof on public.invoices
  for update using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));

-- ---------------------------------------------------------------------------
-- Demand tables : ADMIN ONLY. Vendor can never read search misses or
-- snapshot project names / profile ids (PRD §9, AGENTS.md).
-- ---------------------------------------------------------------------------
create policy ingest_log_admin on public.ingest_log
  for select using (public.is_admin());

create policy search_misses_admin on public.search_misses
  for select using (public.is_admin());

create policy missing_requests_admin on public.missing_requests
  for all using (public.is_admin()) with check (public.is_admin());

create policy usage_snapshots_admin on public.usage_snapshots
  for all using (public.is_admin()) with check (public.is_admin());

create policy usage_items_admin on public.usage_snapshot_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy usage_history_admin on public.usage_history
  for all using (public.is_admin()) with check (public.is_admin());

-- Vendors read only their own aggregate rollup; never the raw snapshots.
create policy daily_usage_vendor_read on public.daily_asset_usage
  for select using (public.is_admin() or public.is_vendor_member(vendor_id));

-- ---------------------------------------------------------------------------
-- quote_requests : architect creates & reads own; vendor reads own leads
-- ---------------------------------------------------------------------------
create policy quotes_architect_read on public.quote_requests
  for select using (architect_id = auth.uid());
create policy quotes_architect_insert on public.quote_requests
  for insert with check (architect_id = auth.uid());
create policy quotes_vendor_read on public.quote_requests
  for select using (public.is_vendor_member(vendor_id));
create policy quotes_vendor_update on public.quote_requests
  for update using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));
create policy quotes_admin on public.quote_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log : admin read; written by triggers/RPCs (service role)
-- ---------------------------------------------------------------------------
create policy audit_admin_read on public.audit_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Force new profiles to the lowest role (prevents privilege escalation).
-- ---------------------------------------------------------------------------
create or replace function public.force_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := 'architect';
  end if;
  return new;
end $$;

create trigger profiles_force_role
  before insert or update on public.profiles
  for each row execute function public.force_profile_role();

-- Auto-create a profile row on sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
