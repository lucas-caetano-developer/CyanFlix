-- Remove cast, crew and related credit metadata from Work, Season, Episode, EditorialOverride safely
DO $$
BEGIN
  -- 1. Remove credit keys from Work.metadata
  UPDATE "Work"
  SET "metadata" = "metadata"::jsonb - '{cast,crew,credits,directors,director,creators,creator,writers,writer,screenwriters,screenwriter,producers,producer,actors,people,staff,characters}'::text[]
  WHERE "metadata" IS NOT NULL;

  -- 2. Remove nested credits inside tmdb if present
  UPDATE "Work"
  SET "metadata" = jsonb_set(
    "metadata"::jsonb,
    '{tmdb}',
    ("metadata"::jsonb->'tmdb') - '{credits,cast,crew,directors,writers,creators,producers,staff,characters}'::text[]
  )
  WHERE "metadata" IS NOT NULL
    AND jsonb_typeof("metadata"::jsonb->'tmdb') = 'object';

  -- 3. Remove nested credits inside anilist if present
  UPDATE "Work"
  SET "metadata" = jsonb_set(
    "metadata"::jsonb,
    '{anilist}',
    ("metadata"::jsonb->'anilist') - '{credits,cast,crew,directors,writers,creators,producers,staff,characters}'::text[]
  )
  WHERE "metadata" IS NOT NULL
    AND jsonb_typeof("metadata"::jsonb->'anilist') = 'object';

  -- 4. Remove credit keys from Season.metadata
  UPDATE "Season"
  SET "metadata" = "metadata"::jsonb - '{cast,crew,credits,directors,director,creators,creator,writers,writer,screenwriters,screenwriter,producers,producer,actors,people,staff,characters}'::text[]
  WHERE "metadata" IS NOT NULL;

  -- 5. Remove credit keys from Episode.metadata
  UPDATE "Episode"
  SET "metadata" = "metadata"::jsonb - '{cast,crew,credits,directors,director,creators,creator,writers,writer,screenwriters,screenwriter,producers,producer,actors,people,staff,characters}'::text[]
  WHERE "metadata" IS NOT NULL;

  -- 6. Remove credit keys from EditorialOverride.metadata
  UPDATE "EditorialOverride"
  SET "metadata" = "metadata"::jsonb - '{cast,crew,credits,directors,director,creators,creator,writers,writer,screenwriters,screenwriter,producers,producer,actors,people,staff,characters}'::text[]
  WHERE "metadata" IS NOT NULL;

  -- 7. Update searchText in Work
  UPDATE "Work"
  SET "searchText" = concat_ws(' ', "title", "originalTitle", "synopsis", "metadata"::text);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso na limpeza de metadados: %', SQLERRM;
END $$;
