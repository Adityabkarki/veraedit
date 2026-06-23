-- ViraEdit PostgreSQL Initialization
-- Runs once on first container startup (via docker-entrypoint-initdb.d)
-- Enables extensions required by ViraEdit

-- pgvector: semantic search over transcript embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: fuzzy text search (transcript search, Nepali word matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: accent-insensitive search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- uuid-ossp: UUID generation (used for all primary keys)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Configure timezone
SET timezone = 'UTC';

-- Verify extensions installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension failed to install';
    END IF;
    RAISE NOTICE 'ViraEdit PostgreSQL initialized successfully';
    RAISE NOTICE 'Extensions: vector, pg_trgm, unaccent, uuid-ossp';
END $$;
