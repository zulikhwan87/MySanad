-- Minimal stand-in for the parts of Supabase that MySanad migrations depend on.
-- Used ONLY by the PGlite test harness; never applied to a real Supabase project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;

CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID
$$;

CREATE TABLE storage.buckets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public BOOLEAN NOT NULL DEFAULT FALSE,
    file_size_limit BIGINT,
    allowed_mime_types TEXT[]
);

CREATE TABLE storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT NOT NULL,
    owner UUID,
    metadata JSONB
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;

-- Mirror Supabase's default grants on the public schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
