-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL PRIMARY KEY,
    full_name TEXT NULL,
    avatar_url TEXT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add role column to profiles table if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NULL;

-- Add comments for clarity
COMMENT ON TABLE public.profiles IS 'Stores public user profile information.';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id, the unique identifier for the user. This is the primary key.';
COMMENT ON COLUMN public.profiles.full_name IS 'The user''s full name.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL for the user''s avatar image.';
COMMENT ON COLUMN public.profiles.created_at IS 'Timestamp of when the profile was created.';
COMMENT ON COLUMN public.profiles.updated_at IS 'Timestamp of when the profile was last updated.';
COMMENT ON COLUMN public.profiles.role IS 'User role, e.g., admin, user, demo.';

-- Enable Row Level Security (RLS) for the profiles table if not already enabled.
-- This is a common practice for Supabase tables.
-- Policies should be defined elsewhere based on application requirements.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Example policy: Allow users to read their own profile
-- This is just an example, actual policies will depend on application needs.
-- You might want to create this in a separate policy file or via Supabase UI.
-- CREATE POLICY "Users can view their own profile"
-- ON public.profiles FOR SELECT
-- USING ( auth.uid() = id );

-- CREATE POLICY "Users can insert their own profile"
-- ON public.profiles FOR INSERT
-- WITH CHECK ( auth.uid() = id );

-- CREATE POLICY "Users can update their own profile"
-- ON public.profiles FOR UPDATE
-- USING ( auth.uid() = id )
-- WITH CHECK ( auth.uid() = id );

-- Note: Consider if you need to backfill any existing users with a default role.
-- This migration does not do that automatically.
-- Example: UPDATE public.profiles SET role = 'user' WHERE role IS NULL; (Run this manually if needed after applying migration)
