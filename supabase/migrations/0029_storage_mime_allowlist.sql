-- Dirory - restrict the materials bucket to real image/PDF types
-- 0029_storage_mime_allowlist.sql
--
-- OWASP A08 (software and data integrity) / A05 (misconfiguration).
--
-- `materials` had `allowed_mime_types = null`, which means **any** type. It is
-- the bucket that receives user-supplied files: material textures, model
-- thumbnails, and — the part that matters — **payment proofs**. An admin opens a
-- proof from Admin → Payments through a signed URL, so an arbitrary upload is a
-- file an admin may well open.
--
-- A permissive type list allows HTML or SVG, both of which can carry script. The
-- bucket is private and served from the storage origin rather than from
-- dirory.com, so it could not reach a Dirory session — but there is no reason to
-- accept a file type nothing in the product ever produces.
--
-- The list is exactly what the app uploads:
--   * `FileUpload` for a material accepts `image/*`
--   * `PaymentProof` accepts `image/*,application/pdf`
--
-- SVG is deliberately excluded even though `image/*` would allow it: nothing
-- uploads an SVG here, and it is the one image format that executes.
--
-- `models` is left alone on purpose. It holds `.skp` files, which browsers send
-- as `application/octet-stream` or with no type at all; a strict list there would
-- reject legitimate uploads. It is private, vendor-writable only, and read by
-- signed URL.

update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg',
     'image/png',
     'image/webp',
     'image/avif',
     'image/gif',
     'application/pdf'
   ]
 where id = 'materials';
