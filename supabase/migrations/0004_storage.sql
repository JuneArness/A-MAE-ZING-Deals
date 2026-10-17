-- =============================================================================
-- A MAE Zing Deals | 0004 Image storage (Supabase Storage)
-- Public bucket for product photos: anyone can VIEW an image by its URL, only
-- admins can upload, replace or delete. 5 MB limit; JPG, PNG and WebP only.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins can list product images" on storage.objects
  for select to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "Admins can upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "Admins can replace product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "Admins can delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
