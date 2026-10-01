-- Posters on forms: an "Image" field shows a picture to the person filling in
-- the form (for example a class poster). The picture lives in a public
-- storage bucket so visitors who are not logged in can see it; only admins
-- can add, replace or remove files. SVG is left out on purpose: an SVG opened
-- on its own address can run scripts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-images',
  'form-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "form_images_insert_admin"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'form-images' and public.is_admin());

create policy "form_images_update_admin"
on storage.objects
for update
to authenticated
using (bucket_id = 'form-images' and public.is_admin())
with check (bucket_id = 'form-images' and public.is_admin());

create policy "form_images_delete_admin"
on storage.objects
for delete
to authenticated
using (bucket_id = 'form-images' and public.is_admin());
