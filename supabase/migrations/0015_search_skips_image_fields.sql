-- ---------------------------------------------------------------------------
-- Search ignores the new image fields
-- ---------------------------------------------------------------------------
-- Image references can now say which Cloudinary cloud holds them, that they
-- are served as uploaded, and which part of a sheet of figures to show
-- (cloud, delivery, region). Like public_id and the dimensions, these are
-- metadata: indexed, every figure's question would match its cloud name and
-- its sheet coordinates. Same function as 0002 with those three keys added.
create or replace function public.jsonb_deep_text(doc jsonb)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  parts text := '';
  child jsonb;
  entry record;
begin
  if doc is null then
    return '';
  end if;

  case jsonb_typeof(doc)
    when 'string' then
      return doc #>> '{}';
    when 'number' then
      return doc #>> '{}';
    when 'array' then
      for child in select value from jsonb_array_elements(doc) loop
        parts := parts || ' ' || public.jsonb_deep_text(child);
      end loop;
      return parts;
    when 'object' then
      for entry in select key, value from jsonb_each(doc) loop
        continue when entry.key in (
          'type', 'provider', 'public_id', 'version',
          'format', 'width', 'height', 'schema_version',
          'cloud', 'delivery', 'region'
        );
        parts := parts || ' ' || public.jsonb_deep_text(entry.value);
      end loop;
      return parts;
    else
      return '';
  end case;
end;
$$;
