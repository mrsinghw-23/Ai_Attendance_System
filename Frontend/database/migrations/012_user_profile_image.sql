-- User profile photo for header / account menu
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
