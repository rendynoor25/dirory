-- Dirory — vendor portal: usage metrics + subscription payments (FR-V4/V5/V6, M7/M8)
-- 0012_vendor_portal.sql
--
-- Why functions rather than direct queries: a vendor must never read
-- `usage_snapshots`, `usage_history` or architect identities (PRD §9, AGENTS.md).
-- These are SECURITY DEFINER so they can read the raw tables, but every one of
-- them returns AGGREGATES ONLY — never a project name or a profile id — and each
-- checks membership itself.
--
-- The metrics are computed on the fly from the snapshot tables. The nightly
-- `daily_asset_usage` rollup still exists as an optimisation, but it needs
-- pg_cron and had never been scheduled, which is why the old dashboard showed
-- zeros forever.

-- ---------------------------------------------------------------------------
-- 1. Usage totals for a vendor in a date range (FR-V4)
-- ---------------------------------------------------------------------------
create or replace function public.vendor_usage_totals(
  p_vendor uuid, p_from date, p_to date)
returns table(projects int, units int, area_m2 numeric, architects int, quotes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  return query
    select
      count(distinct s.install_id::text || ':' || s.model_id)::int,
      coalesce(sum(i.qty), 0)::int,
      coalesce(sum(i.area_m2), 0)::numeric,
      count(distinct s.profile_id)::int,
      (select count(*)::int from public.quote_requests q
        where q.vendor_id = p_vendor
          and q.created_at::date between p_from and p_to)
    from public.usage_snapshot_items i
    join public.usage_snapshots s on s.id = i.snapshot_id
    join public.assets a on a.id = i.asset_id
   where a.vendor_id = p_vendor
     and i.asset_id is not null
     and s.taken_at::date between p_from and p_to;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Per-product aggregates (FR-V4)
-- ---------------------------------------------------------------------------
create or replace function public.vendor_usage_by_asset(
  p_vendor uuid, p_from date, p_to date)
returns table(
  asset_id uuid, name text, type asset_type,
  projects int, units int, area_m2 numeric, quotes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  return query
    select
      a.id,
      a.name,
      a.type,
      coalesce(u.projects, 0)::int,
      coalesce(u.units, 0)::int,
      coalesce(u.area_m2, 0)::numeric,
      coalesce(q.quotes, 0)::int
    from public.assets a
    left join (
      select i.asset_id,
             count(distinct s.install_id::text || ':' || s.model_id) as projects,
             sum(i.qty) as units,
             sum(i.area_m2) as area_m2
        from public.usage_snapshot_items i
        join public.usage_snapshots s on s.id = i.snapshot_id
       where s.taken_at::date between p_from and p_to
       group by i.asset_id
    ) u on u.asset_id = a.id
    -- Quote requests store their items as jsonb; match them by asset_id.
    left join (
      select e->>'asset_id' as asset_id, count(*) as quotes
        from public.quote_requests q,
             jsonb_array_elements(q.items) e
       where q.vendor_id = p_vendor
         and q.created_at::date between p_from and p_to
       group by 1
    ) q on q.asset_id = a.id::text
   where a.vendor_id = p_vendor
     and a.status <> 'archived'
   order by (coalesce(u.units, 0) + coalesce(u.area_m2, 0)) desc, a.name;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Daily series for the trend chart (FR-V4)
--
-- `usage_snapshots` is upserted (latest state per install+model), so it has no
-- history. `usage_history` is append-only, but its items carry the plugin's own
-- labels (brand + name) rather than an asset id — so a point is attributed to a
-- product by matching the vendor's brand and the product name. Good enough for a
-- trend line; the exact per-product totals come from function 2 above.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_usage_daily(
  p_vendor uuid, p_from date, p_to date)
returns table(asset_id uuid, day date, units int, area_m2 numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_brand text;
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  select brand_name into v_brand from public.vendors where id = p_vendor;

  return query
    select a.id,
           h.taken_at::date,
           coalesce(sum((e->>'qty')::numeric), 0)::int,
           coalesce(sum((e->>'area_m2')::numeric), 0)::numeric
      from public.usage_history h,
           jsonb_array_elements(h.items) e
      join public.assets a
        on a.vendor_id = p_vendor
       and a.name = (e->>'name')
     where (e->>'brand') = v_brand
       and h.taken_at::date between p_from and p_to
     group by a.id, h.taken_at::date
     order by h.taken_at::date;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Subscription + invoice columns for payment (FR-V6 / FR-M5)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists payment_method text,
  add column if not exists proof_reference text,
  -- Dynamic QRIS (Midtrans/Xendit) writes these; unused for a bank transfer.
  add column if not exists qr_string text,
  add column if not exists qr_url text,
  add column if not exists qr_expires_at timestamptz;

comment on column public.invoices.payment_method is
  'Vendor''s chosen method: "qris" or "transfer". Null until chosen.';
comment on column public.invoices.proof_reference is
  'The reference / sender note the vendor typed when uploading transfer proof.';
comment on column public.invoices.qr_string is
  'Dynamic QRIS payload from the gateway (rendered as a QR client-side).';

-- ---------------------------------------------------------------------------
-- 5. Vendor picks a plan → subscription + an unpaid invoice (FR-V6)
--
-- Idempotent: calling it again reuses an existing unpaid invoice (updating the
-- amount if the plan changed) rather than stacking duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_request_subscription(p_plan uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  sub_id uuid;
  p public.plans;
  inv_id uuid;
begin
  select vm.vendor_id into v_id
    from public.vendor_members vm
   where vm.profile_id = auth.uid()
   order by (vm.role = 'owner') desc, vm.created_at
   limit 1;
  if v_id is null then raise exception 'not a vendor'; end if;
  if not public.is_vendor_editor(v_id) then raise exception 'not allowed'; end if;

  select * into p from public.plans where id = p_plan and active;
  if p is null then raise exception 'plan not found'; end if;

  select id into sub_id
    from public.subscriptions
   where vendor_id = v_id
   order by created_at
   limit 1;

  if sub_id is null then
    insert into public.subscriptions (vendor_id, plan_id, status, current_period_start)
    values (v_id, p_plan, 'trial', now())
    returning id into sub_id;
  else
    update public.subscriptions set plan_id = p_plan where id = sub_id;
  end if;

  select id into inv_id
    from public.invoices
   where vendor_id = v_id and status = 'unpaid'
   order by created_at desc
   limit 1;

  if inv_id is null then
    insert into public.invoices
      (vendor_id, subscription_id, amount_idr, status, gateway, due_at)
    values
      (v_id, sub_id, p.price_idr, 'unpaid', 'manual', now() + interval '7 days')
    returning id into inv_id;
  else
    update public.invoices
       set amount_idr = p.price_idr, subscription_id = sub_id
     where id = inv_id;
  end if;

  perform public.write_audit('invoice.requested', 'invoices', inv_id::text,
    jsonb_build_object('plan', p.name, 'amount', p.price_idr));
  return inv_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Vendor says "I've paid" — attach proof + reference (FR-M5)
-- ---------------------------------------------------------------------------
create or replace function public.vendor_submit_payment(
  p_invoice uuid, p_proof_path text default null, p_reference text default null,
  p_method text default null)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then raise exception 'invoice not found'; end if;
  if not (public.is_vendor_member(inv.vendor_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if inv.status <> 'unpaid' then raise exception 'invoice is not awaiting payment'; end if;

  update public.invoices
     set proof_path = coalesce(nullif(btrim(p_proof_path), ''), proof_path),
         proof_reference = nullif(btrim(p_reference), ''),
         payment_method = coalesce(nullif(btrim(p_method), ''), payment_method)
   where id = p_invoice
   returning * into inv;

  perform public.write_audit('invoice.proof_submitted', 'invoices', p_invoice::text,
    jsonb_build_object('reference', p_reference, 'method', p_method));
  return inv;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Vendor records which method it will use (so the invoice page remembers)
-- ---------------------------------------------------------------------------
create or replace function public.vendor_set_payment_method(
  p_invoice uuid, p_method text)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  if p_method not in ('qris', 'transfer') then raise exception 'bad method'; end if;
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then raise exception 'invoice not found'; end if;
  if not (public.is_vendor_member(inv.vendor_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  update public.invoices set payment_method = p_method
   where id = p_invoice
   returning * into inv;
  return inv;
end $$;
