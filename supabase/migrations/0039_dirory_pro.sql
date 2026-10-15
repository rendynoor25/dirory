-- Dirory - Dirory Pro for architects, paid by QRIS
-- 0039_dirory_pro.sql
--
-- Dirory Pro unlocks the RAB (cost estimate) in the plugin. Two plans at
-- launch, both editable here without code:
--   pro_monthly  Rp 99.000  30 days, every model
--   pro_project  Rp 49.000  30 days, the first model it is used on
--
-- Flow: the architect starts an order on /pro (pro_create_order), the website
-- mints a dynamic QRIS for it (order id "DRP-<order>-<time>"), Midtrans calls
-- the existing webhook, which settles it with mark_pro_order_paid(). The `rab`
-- Edge Function then finds an active entitlement.
--
-- Vendors' invoices and subscriptions are separate and untouched.

create table public.pro_plans (
  id         text primary key,
  name       text not null,
  price_idr  int  not null check (price_idr > 0),
  days       int  not null check (days > 0),
  per_model  boolean not null default false,  -- true: binds to one SketchUp model
  active     boolean not null default true,
  sort       int not null default 0
);

insert into public.pro_plans (id, name, price_idr, days, per_model, sort) values
  ('pro_monthly', 'Dirory Pro — monthly', 99000, 30, false, 1),
  ('pro_project', 'Dirory Pro — one project', 49000, 30, true, 2);

create table public.pro_orders (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  plan_id       text not null references public.pro_plans(id),
  amount_idr    int  not null,
  status        text not null default 'unpaid' check (status in ('unpaid','paid','expired','cancelled')),
  gateway       text,
  gateway_ref   text,
  qr_string     text,
  qr_url        text,
  qr_expires_at timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index pro_orders_profile_idx on public.pro_orders (profile_id, created_at desc);
create index pro_orders_gateway_ref_idx on public.pro_orders (gateway_ref);

create table public.pro_entitlements (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  plan_id     text not null references public.pro_plans(id),
  order_id    uuid unique references public.pro_orders(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  -- Project pass only: sha256 of the SketchUp model's guid, set on first use.
  model_hash  text,
  created_at  timestamptz not null default now()
);
create index pro_entitlements_profile_idx on public.pro_entitlements (profile_id, ends_at desc);

-- Notifications for Pro orders are logged next to invoice ones.
alter table public.payment_events
  add column if not exists pro_order_id uuid references public.pro_orders(id) on delete set null;

alter table public.pro_plans        enable row level security;
alter table public.pro_orders       enable row level security;
alter table public.pro_entitlements enable row level security;

create policy pro_plans_read on public.pro_plans for select using (active or public.is_admin());
create policy pro_plans_admin on public.pro_plans for all using (public.is_admin()) with check (public.is_admin());
create policy pro_orders_own on public.pro_orders for select using (profile_id = auth.uid() or public.is_admin());
create policy pro_entitlements_own on public.pro_entitlements for select using (profile_id = auth.uid() or public.is_admin());
-- No client writes: orders are created by pro_create_order and settled by the
-- webhook (service role).

-- ---------------------------------------------------------------------------
-- Start an order for the signed-in architect at the plan's current price.
-- The price comes from the table, never from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.pro_create_order(p_plan text)
returns public.pro_orders
language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  plan public.pro_plans;
  ord  public.pro_orders;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into plan from public.pro_plans where id = p_plan and active;
  if not found then
    raise exception 'unknown plan';
  end if;
  -- Reuse an unpaid order for the same plan from the last hour rather than
  -- piling up orders on every refresh.
  select * into ord from public.pro_orders
   where profile_id = me and plan_id = plan.id and status = 'unpaid'
     and amount_idr = plan.price_idr and created_at > now() - interval '1 hour'
   order by created_at desc limit 1;
  if found then
    return ord;
  end if;
  insert into public.pro_orders (profile_id, plan_id, amount_idr)
  values (me, plan.id, plan.price_idr)
  returning * into ord;
  return ord;
end $$;

revoke all on function public.pro_create_order(text) from public, anon;
grant execute on function public.pro_create_order(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settle a paid order (webhook, service role). Idempotent: a second call for
-- the same order changes nothing. Monthly extends from whichever is later,
-- now or the end of the current monthly period; a project pass always starts
-- now and is bound to a model on first use.
-- ---------------------------------------------------------------------------
create or replace function public.mark_pro_order_paid(
  p_order uuid, p_gateway text default null, p_reference text default null)
returns public.pro_entitlements
language plpgsql security definer set search_path = public as $$
declare
  ord   public.pro_orders;
  plan  public.pro_plans;
  ent   public.pro_entitlements;
  start timestamptz := now();
begin
  select * into ord from public.pro_orders where id = p_order for update;
  if not found then
    raise exception 'order not found';
  end if;
  select * into ent from public.pro_entitlements where order_id = ord.id;
  if found then
    return ent;  -- already settled
  end if;
  select * into plan from public.pro_plans where id = ord.plan_id;

  if not plan.per_model then
    select greatest(now(), max(ends_at)) into start
      from public.pro_entitlements e
      join public.pro_plans p on p.id = e.plan_id and not p.per_model
     where e.profile_id = ord.profile_id;
    start := coalesce(start, now());
  end if;

  update public.pro_orders
     set status = 'paid', paid_at = now(),
         gateway = coalesce(p_gateway, gateway),
         gateway_ref = coalesce(p_reference, gateway_ref)
   where id = ord.id;

  insert into public.pro_entitlements (profile_id, plan_id, order_id, starts_at, ends_at)
  values (ord.profile_id, plan.id, ord.id, start, start + make_interval(days => plan.days))
  returning * into ent;

  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  values (null, 'pro.paid', 'pro_order', ord.id::text,
          jsonb_build_object('plan', plan.id, 'amount_idr', ord.amount_idr, 'ends_at', ent.ends_at));
  return ent;
end $$;

revoke all on function public.mark_pro_order_paid(uuid, text, text) from public, anon, authenticated;

comment on table public.pro_entitlements is
  'Dirory Pro access periods. pro_project rows bind to one model (model_hash) on first RAB use.';
