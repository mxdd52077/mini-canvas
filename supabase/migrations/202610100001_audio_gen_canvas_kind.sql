alter table public.canvas_objects
  drop constraint if exists canvas_objects_kind_check;

alter table public.canvas_objects
  add constraint canvas_objects_kind_check
  check (kind in (
    'rect',
    'ellipse',
    'polygon',
    'path',
    'text',
    'frame',
    'group',
    'image',
    'video',
    'image-gen',
    'video-gen',
    'audio-gen'
  ));
