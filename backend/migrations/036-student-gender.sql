BEGIN;

-- Old rows have no reliable source; never infer gender from names or contacts.
ALTER TABLE app.students ADD COLUMN gender text CHECK (gender IN ('Nam','Nữ'));

COMMIT;
