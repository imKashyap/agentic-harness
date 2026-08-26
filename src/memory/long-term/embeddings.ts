import { createLogger } from "../../utils/logger.js";

const logger = createLogger("Embeddings");

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic local term-frequency hashing embedder.
 * Zero external dependencies. Ideal for tests, offline mode, and fast local recall.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly dimensions: number = 64) {}

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (tokens.length === 0) {
      return vector;
    }

    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }

      const index = Math.abs(hash) % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = (vector[i] ?? 0) / magnitude;
      }
    }

    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

/**
 * Production embedding provider calling OpenRouter / OpenAI embeddings API.
 */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "openai/text-embedding-3-small",
  ) {}

  async embed(text: string): Promise<number[]> {
    const batch = await this.embedBatch([text]);
    const first = batch[0];
    if (!first) {
      throw new Error("No embedding returned from provider");
    }
    return first;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouterEmbeddingProvider");
    }

    logger.debug(`Generating embeddings for ${texts.length} text(s) with model: ${this.model}`);

    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OpenRouter embeddings API failed: ${errorText}`);
      throw new Error(`OpenRouter embeddings API failed [${response.status}]: ${errorText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid response format from OpenRouter embeddings API");
    }

    return data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
