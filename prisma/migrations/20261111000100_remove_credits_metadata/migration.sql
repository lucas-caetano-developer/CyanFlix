-- Remove cast, crew and related credit metadata from Work, Season, Episode, EditorialOverride
UPDATE "Work"
SET "metadata" = (
  ("metadata"::jsonb - ARRAY['cast', 'crew', 'credits', 'directors', 'director', 'creators', 'creator', 'writers', 'writer', 'screenwriters', 'screenwriter', 'producers', 'producer', 'actors', 'people', 'staff', 'characters'])
  || CASE 
       WHEN "metadata"::jsonb ? 'tmdb' AND jsonb_typeof("metadata"::jsonb->'tmdb') = 'object' THEN
         jsonb_build_object('tmdb', ("metadata"::jsonb->'tmdb' - ARRAY['credits', 'cast', 'crew', 'directors', 'writers', 'creators', 'producers', 'staff', 'characters']))
       ELSE '{}'::jsonb
     END
  || CASE 
       WHEN "metadata"::jsonb ? 'anilist' AND jsonb_typeof("metadata"::jsonb->'anilist') = 'object' THEN
         jsonb_build_object('anilist', ("metadata"::jsonb->'anilist' - ARRAY['credits', 'cast', 'crew', 'directors', 'writers', 'creators', 'producers', 'staff', 'characters']))
       ELSE '{}'::jsonb
     END
);

UPDATE "Season"
SET "metadata" = (
  ("metadata"::jsonb - ARRAY['cast', 'crew', 'credits', 'directors', 'director', 'creators', 'creator', 'writers', 'writer', 'screenwriters', 'screenwriter', 'producers', 'producer', 'actors', 'people', 'staff', 'characters'])
  || CASE 
       WHEN "metadata"::jsonb ? 'tmdb' AND jsonb_typeof("metadata"::jsonb->'tmdb') = 'object' THEN
         jsonb_build_object('tmdb', ("metadata"::jsonb->'tmdb' - ARRAY['credits', 'cast', 'crew', 'directors', 'writers', 'creators', 'producers', 'staff', 'characters']))
       ELSE '{}'::jsonb
     END
  || CASE 
       WHEN "metadata"::jsonb ? 'anilist' AND jsonb_typeof("metadata"::jsonb->'anilist') = 'object' THEN
         jsonb_build_object('anilist', ("metadata"::jsonb->'anilist' - ARRAY['credits', 'cast', 'crew', 'directors', 'writers', 'creators', 'producers', 'staff', 'characters']))
       ELSE '{}'::jsonb
     END
);

UPDATE "Episode"
SET "metadata" = (
  "metadata"::jsonb - ARRAY['cast', 'crew', 'credits', 'directors', 'director', 'creators', 'creator', 'writers', 'writer', 'screenwriters', 'screenwriter', 'producers', 'producer', 'actors', 'people', 'staff', 'characters']
);

UPDATE "EditorialOverride"
SET "metadata" = (
  "metadata"::jsonb - ARRAY['cast', 'crew', 'credits', 'directors', 'director', 'creators', 'creator', 'writers', 'writer', 'screenwriters', 'screenwriter', 'producers', 'producer', 'actors', 'people', 'staff', 'characters']
);

UPDATE "Work"
SET "searchText" = concat_ws(' ', "title", "originalTitle", "synopsis", "metadata"::text);
