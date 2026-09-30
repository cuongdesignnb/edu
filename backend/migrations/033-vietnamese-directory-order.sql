BEGIN;
CREATE COLLATION app.vi_names (provider=icu,locale='vi-u-ks-level1',deterministic=false);
-- Match the existing frontend fold(): NFD, remove U+0300..U+036F, đ -> d, lowercase.
CREATE FUNCTION app.fold_vi(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT replace(regexp_replace(normalize(lower(value),NFD),U&'[\0300-\036f]','','g'),'đ','d')
$$;
REVOKE ALL ON FUNCTION app.fold_vi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fold_vi(text) TO edu_app;
COMMIT;
