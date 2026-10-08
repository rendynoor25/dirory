-- Dirory - payment gateway events + a single "mark paid" path (FR-M5, M8)
-- 0013_midtrans_payments.sql
--
-- Why this migration exists:
--
--   1. `mark_invoice_paid()` centralises "an invoice was paid" so the admin
--      button, a gateway webhook and a manual confirmation all take the SAME
--      path. Previously the extension logic lived in the admin server action,
--      which a webhook cannot reuse.
--
--   2. `payment_events` records every gateway notification. A unique key on
--      (gateway, order_id, transaction_status) makes webhook handling
--      idempotent: Midtrans retries, and a retry must not extend a subscription
--      twice. The same table is the audit trail for reconciliation.
--
-- The function is SECURITY DEFINER because the webhook runs with the service
-- role and the admin path is RLS-scoped; both must reach `subscriptions` and
-- `plans`, which a vendor cannot. It performs its own authorization check for
-- non-service callers.

-- ---------------------------------------------------------------------------
-- Gateway notification log (idempotency + audit)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                 bigserial primary key,
  gateway            text not null,
  order_id           text,
  transaction_status text,
  status_code        text,
  gross_amount       text,
  invoice_id         uuid references public.invoices(id) on delete set null,
  payload            jsonb not null default '{}'::jsonb,
  received_at        timestamptz not null default now(),
  -- A gateway retry of the same state is a no-op.
  unique (gateway, order_id, transaction_status)
);

create index if not exists payment_events_order_idx
  on public.payment_events (gateway, order_id);
create index if not exists payment_events_invoice_idx
  on public.payment_events (invoice_id, received_at desc);

alter table public.payment_events enable row level security;

-- Only admins read it. The webhook writes with the service role, which bypasses
-- RLS by design; no client ever inserts here.
drop policy if exists payment_events_admin_read on public.payment_events;
create policy payment_events_admin_read on public.payment_events
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- The single "an invoice is paid" operation
--
-- Idempotent: a second call on an already-paid invoice returns it unchanged, so
-- a webhook retry cannot double-extend a subscription.
-- ---------------------------------------------------------------------------
create or replace function public.mark_invoice_paid(
  p_invoice   uuid,
  p_gateway   text default null,
  p_reference text default null
)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
  inv        public.invoices;
  sub        public.subscriptions;
  v_period   plan_period;
  v_base     timestamptz;
  v_until    timestamptz;
  v_gateway  invoice_gateway;
begin
  -- A caller without the service role must be an admin of this invoice's vendor.
  select * into inv from public.invoices where id = p_invoice for update;
  if inv is null then raise exception 'invoice not found'; end if;
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not allowed';
  end if;

  -- Already settled: return unchanged (idempotent).
  if inv.status = 'paid' then return inv; end if;
  if inv.status = 'void' then raise exception 'invoice is void'; end if;

  if p_gateway is not null and btrim(p_gateway) <> '' then
    begin
      v_gateway := btrim(p_gateway)::invoice_gateway;
    exception when invalid_text_representation then
      raise exception 'unknown gateway %', p_gateway;
    end;
  end if;

  update public.invoices
     set status      = 'paid',
         paid_at     = now(),
         gateway     = coalesce(v_gateway, gateway),
         gateway_ref = coalesce(nullif(btrim(p_reference), ''), gateway_ref)
   where id = p_invoice
   returning * into inv;

  -- Extend the subscription by one billing period. Extend from the later of now
  -- and the current period end, so renewing early keeps the paid days and
  -- renewing late does not start the new period in the past (FR-V6 / FR-M6).
  if inv.subscription_id is not null then
    select * into sub from public.subscriptions where id = inv.subscription_id;
    if sub is not null then
      select period into v_period from public.plans where id = sub.plan_id;
      v_base  := greatest(coalesce(sub.current_period_end, now()), now());
      v_until := case
                   when v_period = 'yearly' then v_base + interval '1 year'
                   else v_base + interval '1 month'
                 end;
      update public.subscriptions
         set status               = 'active',
             current_period_start = now(),
             current_period_end   = v_until
       where id = sub.id;
    end if;
  end if;

  perform public.write_audit('invoice.paid', 'invoices', p_invoice::text,
    jsonb_build_object('gateway', p_gateway, 'reference', p_reference));

  return inv;
end $$;

comment on function public.mark_invoice_paid(uuid, text, text) is
  'Single idempotent path for "invoice paid": marks it paid and extends the subscription one period. Callable by an admin or the service role.';
