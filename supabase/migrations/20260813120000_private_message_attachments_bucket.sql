-- Message/note attachments (photos, voice notes, PDFs sent between teachers and
-- parents) were uploading to the public "media" bucket with permanent public URLs --
-- anyone with the link could view them forever, no login required. This is not
-- appropriate for private family communications involving minors. Move them to a
-- dedicated private bucket; access is granted only via short-lived signed URLs
-- issued by /api/programs/[programId]/message-attachments/signed-url after that
-- route re-checks the caller can read the specific announcement/note the
-- attachment belongs to. No storage.objects policies are added here on purpose --
-- the bucket is private with no public/authenticated read policies, so only the
-- service-role key (used exclusively by that server route) can read or sign
-- objects in it.
--
-- Non-destructive: only adds a new bucket, does not touch the existing "media"
-- bucket or any existing objects. Already-uploaded attachments (under the old
-- public "media" bucket) keep working via their existing public URLs; only new
-- uploads after this migration go to the private bucket.

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;
