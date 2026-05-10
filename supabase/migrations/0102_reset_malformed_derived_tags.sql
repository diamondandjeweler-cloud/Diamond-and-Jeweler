-- 0102 -- Reset malformed derived_tags (F30/F31)
--
-- Some test-seed talents have derived_tags stored as
-- {"0": null, "1": null, ...} (numeric string keys, null values)
-- instead of {"problem_solving": 0.85, "analytical": 0.72} format.
-- Object.entries() yields [["0", null], ...] and
-- Math.round(null * 100) = NaN on the frontend.
--
-- Reset any derived_tags object where ALL keys are numeric strings to NULL
-- so the matching engine produces fresh extraction on next run.
-- Safe for real users: no legitimate derived_tags have purely numeric keys.

UPDATE public.talents
   SET derived_tags = NULL
 WHERE derived_tags IS NOT NULL
   AND jsonb_typeof(derived_tags) = 'object'
   AND (
     SELECT bool_and(k ~ '^[0-9]+$')
     FROM jsonb_object_keys(derived_tags) AS k
   ) = true;
