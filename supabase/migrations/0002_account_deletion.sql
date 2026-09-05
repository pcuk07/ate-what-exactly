-- In-app account deletion (design doc §10.4 — App Store guideline 5.1.1(v)).
--
-- Most tables cascade from auth.users, but photos in Storage and the OAuth
-- grants need removing explicitly. This function does the whole job in one
-- transaction so a partial delete can't leave orphaned data behind.
--
-- It runs as the definer (the service role) but only ever deletes the calling
-- user's own rows, taken from auth.uid() rather than from an argument, so it
-- cannot be pointed at someone else's account.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Photos first: they are the most sensitive thing we hold.
  delete from storage.objects
   where bucket_id = 'meal-photos'
     and (storage.foldername(name))[1] = uid::text;

  -- Revoke everything connected to their Claude (§10.4).
  delete from public.oauth_refresh_tokens where user_id = uid;
  delete from public.oauth_codes where user_id = uid;

  -- Diary data. These would cascade from auth.users too, but deleting them
  -- here means the data is gone even if the auth row is removed separately.
  delete from public.corrections   where user_id = uid;
  delete from public.calibrations  where user_id = uid;
  delete from public.meals         where user_id = uid;
  delete from public.recipes       where user_id = uid;
  delete from public.goals         where user_id = uid;

  -- Finally the account itself.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling user''s account and every trace of their data. Backing '
  'the in-app "Delete account" control required by App Store guideline 5.1.1(v). '
  'Sign in with Apple token revocation happens in the app, before this is called.';
