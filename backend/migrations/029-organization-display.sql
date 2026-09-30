-- Preserve the agreed organization forms; nullable values remain unconfigured.
ALTER TABLE platform.schools ADD COLUMN public_website text CHECK(public_website IS NULL OR char_length(public_website)<=2048);
ALTER TABLE app.grade_levels ADD COLUMN grade_level integer CHECK(grade_level BETWEEN 1 AND 12);
UPDATE app.grade_levels SET grade_level=code::integer WHERE code ~ '^(1[0-2]|[1-9])$';
ALTER TABLE app.subjects ADD COLUMN color text NOT NULL DEFAULT '#0a72e6' CHECK(color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE app.rooms ADD CONSTRAINT room_capacity_range CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 1000);
ALTER TABLE app.classes ADD COLUMN room_id uuid;
ALTER TABLE app.classes ADD COLUMN motto text CHECK(motto IS NULL OR char_length(motto)<=300);
ALTER TABLE app.classes ADD CONSTRAINT class_room_school_fk FOREIGN KEY(school_id,room_id) REFERENCES app.rooms(school_id,id) ON DELETE RESTRICT;
ALTER TABLE app.terms ADD COLUMN opening_date date;
ALTER TABLE app.terms ADD CONSTRAINT term_opening_range CHECK(opening_date IS NULL OR opening_date>=starts_on AND opening_date<ends_on);
