-- =====================================================================
-- Supabase Storage: public brand assets bucket (logos), tenant-scoped
-- writes. Objects must live under "<tenant_id>/...".
-- Skipped automatically when the storage schema is absent (local tests).
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present; skipping storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('brand-assets', 'brand-assets', true, 2097152,
          array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy brand_assets_tenant_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'brand-assets'
      and ((select public.is_super_admin())
           or (storage.foldername(name))[1] = any (
                select t::text from unnest((select public.my_writable_tenant_ids('manager'))) t))
    )$p$;
  execute $p$
    create policy brand_assets_tenant_update on storage.objects for update to authenticated
    using (
      bucket_id = 'brand-assets'
      and ((select public.is_super_admin())
           or (storage.foldername(name))[1] = any (
                select t::text from unnest((select public.my_writable_tenant_ids('manager'))) t))
    )$p$;
  execute $p$
    create policy brand_assets_tenant_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'brand-assets'
      and ((select public.is_super_admin())
           or (storage.foldername(name))[1] = any (
                select t::text from unnest((select public.my_writable_tenant_ids('manager'))) t))
    )$p$;
end $$;
