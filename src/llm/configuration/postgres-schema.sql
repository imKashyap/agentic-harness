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

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_agent_llm_configs_model ON agent_llm_configs(model_id);
CREATE INDEX IF NOT EXISTS idx_agent_llm_configs_profile ON agent_llm_configs(inference_profile_id);

INSERT INTO llm_config_versions (version, description)
VALUES (1, 'Initial dynamic LLM configuration schema')
ON CONFLICT (version) DO NOTHING;
