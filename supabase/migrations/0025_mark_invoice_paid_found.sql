-- Dirory - fix: paying an invoice never extended the subscription
-- 0025_mark_invoice_paid_found.sql
--
-- `mark_invoice_paid()` guarded its extension block with:
--
--     select * into sub from public.subscriptions where id = inv.subscription_id;
--     if sub is not null then ...
--
-- `sub` is a composite-typed variable (`public.subscriptions`), and for those,
-- PL/pgSQL's `IS NOT NULL` is **not** the complement of `IS NULL`. Against the
-- live database:
--
--     sub IS NULL              -> false
--     sub IS NOT NULL          -> false      <-- both false, row fully populated
--     sub IS DISTINCT FROM NULL-> true
--
-- So the branch was never taken. Every invoice could be confirmed — by the
-- Midtrans webhook or by the admin "Mark paid" button — and be marked paid,
-- while the subscription stayed `trial` with a NULL `current_period_end`.
--
-- The consequence is worse than an unextended period: since 0022 a vendor is
-- only visible while it has an active/grace subscription with a future period
-- end. A vendor that paid would therefore be hidden again seven days later,
-- having received nothing.
--
-- The fix is `IF FOUND THEN`, which PL/pgSQL sets from the SELECT INTO itself and
-- which does not depend on row-comparison semantics.

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
  -- Authorise FIRST. Doing it before the SELECT avoids taking a row lock and
  -- avoids revealing whether an invoice exists to a caller who may not read it.
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not allowed';
  end if;

  select * into inv from public.invoices where id = p_invoice for update;
  if inv is null then raise exception 'invoice not found'; end if;

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
    -- FOUND, not `sub is not null`: see the header. This is the bug this
    -- migration exists to fix.
    if found then
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
