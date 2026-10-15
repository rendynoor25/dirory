-- Dirory - finish A1: no join key from a search miss back to an install
-- 0033_search_miss_unlink_ingest_log.sql
--
-- 0031 dropped install_id and profile_id from search_misses, but every miss
-- received before it also has a row in ingest_log whose id is the miss's id
-- and whose install_id names the install that sent it. That row is a join key
-- back to the architect. The events function now logs misses with a null
-- install_id; this clears the ones already stored.

update public.ingest_log
   set install_id = null
 where kind = 'search_miss'
   and install_id is not null;

-- consent_log is evidence: nobody, service role aside, may change it. 0031
-- only granted select; make the intent explicit for authenticated clients.
revoke insert, update, delete on public.consent_log from anon, authenticated;
