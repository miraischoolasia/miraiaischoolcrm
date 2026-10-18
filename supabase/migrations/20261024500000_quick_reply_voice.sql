-- Quick replies can hold a voice message: the storage bucket accepts audio files as well.
update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav'
]
where id = 'quick-reply-media';
