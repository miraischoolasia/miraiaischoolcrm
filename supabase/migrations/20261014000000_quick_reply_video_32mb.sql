-- Quick replies may hold a video of up to 32 MB (it was 16 MB for everything). Photos and PDFs stay at
-- 16 MB; that is checked in the app, because a storage bucket has one limit for all of its files.

update storage.buckets
set file_size_limit = 33554432
where id = 'quick-reply-media';
