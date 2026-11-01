-- =========================================================================
-- Dynamic LLM Provider, Model, and Inference Configuration Management Schema
-- =========================================================================

CREATE TABLE IF NOT EXISTS llm_config_versions (
    version BIGINT PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT
);

CREATE TABLE IF NOT EXISTS llm_providers (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    provider_type VARCHAR(64) NOT NULL,
    base_url TEXT NOT NULL,
    api_key_env VARCHAR(128) NOT NULL,
    timeout_ms INT,
    max_retries INT,
    default_headers JSONB,
    default_generation JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_models (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    provider_id VARCHAR(128) NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
    model_id VARCHAR(256) NOT NULL,
    context_length INT,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_generation JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_inference_profiles (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    parameters JSONB NOT NULL,
    provider_overrides JSONB,
    model_overrides JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_llm_configs (
    agent_id VARCHAR(128) PRIMARY KEY,
    model_id VARCHAR(128) NOT NULL REFERENCES llm_models(id) ON DELETE RESTRICT,
    inference_profile_id VARCHAR(128) NOT NULL REFERENCES llm_inference_profiles(id) ON DELETE RESTRICT,
    overrides JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id VARCHAR(256) PRIMARY KEY,
    agent_id VARCHAR(128),
    messages JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_updated
    ON agent_sessions(agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS hitl_checkpoints (
    id VARCHAR(256) PRIMARY KEY,
    run_id VARCHAR(256) NOT NULL,
    agent_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(256) NOT NULL,
    capability VARCHAR(256) NOT NULL,
    input JSONB NOT NULL,
    status VARCHAR(32) NOT NULL,
    reason TEXT,
    created_at BIGINT NOT NULL,
    resolved_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_hitl_checkpoints_run_status
    ON hitl_checkpoints(run_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS long_term_memories (
    id VARCHAR(256) PRIMARY KEY,
    agent_id VARCHAR(128),
    session_id VARCHAR(256),
    content TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    embedding JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_long_term_memories_agent_created
    ON long_term_memories(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS llm_config_version_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    version BIGINT NOT NULL
);

INSERT INTO llm_config_version_state (singleton, version)
SELECT TRUE, COALESCE(MAX(version), 1) FROM llm_config_versions
ON CONFLICT (singleton) DO UPDATE
SET version = GREATEST(llm_config_version_state.version, EXCLUDED.version);

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_agent_llm_configs_model ON agent_llm_configs(model_id);
CREATE INDEX IF NOT EXISTS idx_agent_llm_configs_profile ON agent_llm_configs(inference_profile_id);

INSERT INTO llm_config_versions (version, description)
VALUES (1, 'Initial dynamic LLM configuration schema')
ON CONFLICT (version) DO NOTHING;
