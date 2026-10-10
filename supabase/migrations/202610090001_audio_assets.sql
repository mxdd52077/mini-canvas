-- Add audio assets without rebuilding an existing self-hosted database.
alter type public.asset_kind add value if not exists 'audio';

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/x-aac',
  'audio/ogg',
  'application/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/vnd.wav',
  'audio/flac',
  'audio/x-m4a'
]
where id = 'project-assets';
