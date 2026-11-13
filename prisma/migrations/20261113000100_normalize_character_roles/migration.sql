-- Normalize character roles
UPDATE "Character"
SET "role" = 'Secundário'
WHERE LOWER(TRIM("role")) IN ('secundario', 'secundário')
  AND "role" <> 'Secundário';

UPDATE "Character"
SET "role" = 'Coadjuvante'
WHERE LOWER(TRIM("role")) = 'coadjuvante'
  AND "role" <> 'Coadjuvante';

UPDATE "Character"
SET "role" = 'Protagonista'
WHERE LOWER(TRIM("role")) = 'protagonista'
  AND "role" <> 'Protagonista';

UPDATE "Character"
SET "role" = 'Antagonista'
WHERE LOWER(TRIM("role")) = 'antagonista'
  AND "role" <> 'Antagonista';

UPDATE "Character"
SET "role" = 'Coprotagonista'
WHERE LOWER(TRIM("role")) IN ('coprotagonista', 'co-protagonista')
  AND "role" <> 'Coprotagonista';

UPDATE "Character"
SET "role" = 'Deuteragonista'
WHERE LOWER(TRIM("role")) = 'deuteragonista'
  AND "role" <> 'Deuteragonista';

UPDATE "Character"
SET "role" = 'Tritagonista'
WHERE LOWER(TRIM("role")) = 'tritagonista'
  AND "role" <> 'Tritagonista';

UPDATE "Character"
SET "role" = 'Recorrente'
WHERE LOWER(TRIM("role")) = 'recorrente'
  AND "role" <> 'Recorrente';

UPDATE "Character"
SET "role" = 'Participação Especial'
WHERE LOWER(TRIM("role")) IN ('participacao especial', 'participação especial')
  AND "role" <> 'Participação Especial';

UPDATE "Character"
SET "role" = 'Convidado'
WHERE LOWER(TRIM("role")) = 'convidado'
  AND "role" <> 'Convidado';

UPDATE "Character"
SET "role" = 'Narrador'
WHERE LOWER(TRIM("role")) = 'narrador'
  AND "role" <> 'Narrador';

UPDATE "Character"
SET "role" = 'Figurante'
WHERE LOWER(TRIM("role")) = 'figurante'
  AND "role" <> 'Figurante';
