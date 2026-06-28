-- Phase 3 — Reel/Short video scripts (the `script` adapter) are a new content
-- format generated at Gate 2. The original content_items_format_check only knew the
-- four text formats, so a reel_script INSERT failed with a CheckViolationError.
-- Widen the constraint to include reel_script.

alter table content_items drop constraint if exists content_items_format_check;

alter table content_items
    add constraint content_items_format_check
    check (format in ('linkedin_post', 'x_single', 'x_thread', 'ig_caption', 'reel_script'));
