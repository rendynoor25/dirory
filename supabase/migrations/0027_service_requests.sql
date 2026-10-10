-- Dirory - the modelling / digitization order
-- 0027_service_requests.sql
--
-- Digitization was promised in the pricing page and in every vendor proposal, but
-- there was nothing behind it: no request, no queue, no progress. A vendor could
-- pay for a subscription and nothing else. This is the missing object — a job
-- that both sides can see move.
--
--   requested  ->  quoted  ->  accepted  ->  in_progress  ->  delivered
--                                 ^             ^
--                        invoice created   you start work
--
-- "Paid" is deliberately NOT a status. It is derived from the linked invoice
-- (`invoices.status = 'paid'`), so there is one source of truth for money and no
-- change to `mark_invoice_paid()`. The admin queue reads: accepted AND paid.
--
-- A vendor cannot UPDATE this table. Accepting a quote has a side effect — an
-- invoice is created — so it goes through `vendor_accept_service_quote()`, which
-- checks the caller, the status and the amount in one place. An RLS policy alone
-- could not do that safely.

create type service_request_status as enum
  ('requested', 'quoted', 'accepted', 'in_progress', 'delivered', 'cancelled');

create table public.service_requests (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  -- What the vendor asked for, in their words.
  title         text not null,
  product_count int,
  brief         text,
  -- What Dirory set and did.
  quoted_idr    bigint,
  admin_note    text,
  status        service_request_status not null default 'requested',
  invoice_id    uuid references public.invoices(id) on delete set null,
  requested_by  uuid references public.profiles(id) on delete set null,
  started_at    timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index service_requests_vendor_idx on public.service_requests (vendor_id, created_at desc);
create index service_requests_status_idx on public.service_requests (status);

create trigger service_requests_touch
  before update on public.service_requests
  for each row execute function public.touch_updated_at();

alter table public.service_requests enable row level security;

-- Vendors see their own jobs; admins see everything.
create policy service_requests_read on public.service_requests
  for select using (public.is_vendor_member(vendor_id) or public.is_admin());

-- A vendor editor may open a job for their own brand, and only as `requested`:
-- the quote, the schedule and the status belong to Dirory.
create policy service_requests_vendor_insert on public.service_requests
  for insert with check (
    public.is_vendor_editor(vendor_id)
    and status = 'requested'
    and requested_by = auth.uid()
  );

create policy service_requests_admin on public.service_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Accepting a quote creates the invoice. One place, one set of checks.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_accept_service_quote(p_request uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r      public.service_requests;
  v_inv  uuid;
begin
  select * into r from public.service_requests where id = p_request for update;
  if r is null then raise exception 'service request not found'; end if;
  if not (public.is_vendor_editor(r.vendor_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if r.status <> 'quoted' then
    raise exception 'this request is %, not quoted', r.status;
  end if;
  if coalesce(r.quoted_idr, 0) <= 0 then
    raise exception 'no quote has been set';
  end if;
  if r.invoice_id is not null then
    raise exception 'this request already has an invoice';
  end if;

  insert into public.invoices (vendor_id, amount_idr, status, gateway, due_at)
  values (r.vendor_id, r.quoted_idr, 'unpaid', 'manual', now() + interval '7 days')
  returning id into v_inv;

  update public.service_requests
     set status = 'accepted', invoice_id = v_inv
   where id = r.id;

  perform public.write_audit('service.accepted', 'service_requests', r.id::text,
    jsonb_build_object('invoice', v_inv, 'amount', r.quoted_idr));

  return v_inv;
end $$;

comment on function public.vendor_accept_service_quote(uuid) is
  'Vendor accepts a quoted service request: creates the unpaid invoice and moves the job to accepted. Returns the invoice id.';

comment on table public.service_requests is
  'Digitization / modelling jobs. Lifecycle: requested -> quoted -> accepted -> in_progress -> delivered. "Paid" is derived from the linked invoice, never stored.';
