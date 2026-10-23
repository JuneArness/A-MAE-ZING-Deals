-- Small hardening pass (Oct 2026), matching Supabase's security advisor checks.
-- 1. Fixed search_path on the updated_at trigger function.
alter function public.touch_updated_at() set search_path = public;
-- 2. Trigger-only functions are not callable from the website.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.log_inventory_change() from public, anon, authenticated;
-- 3. Functions added later are not callable by signed-out visitors unless granted on purpose.
alter default privileges in schema public revoke execute on functions from public, anon;
