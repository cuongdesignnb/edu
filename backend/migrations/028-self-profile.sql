-- Global self-profile fields are separate from per-school published work contacts.
ALTER TABLE identity.users ADD COLUMN self_work_phone text;
ALTER TABLE identity.users ADD COLUMN self_bio text;
ALTER TABLE identity.users ADD CONSTRAINT self_profile_phone_length CHECK (self_work_phone IS NULL OR char_length(self_work_phone)<=40);
ALTER TABLE identity.users ADD CONSTRAINT self_profile_bio_length CHECK (self_bio IS NULL OR char_length(self_bio)<=2000);
