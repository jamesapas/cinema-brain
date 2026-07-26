/**
 * Env access with fail-fast validation.
 *
 * Anything not prefixed with NEXT_PUBLIC_ is server-only. Reading those from a
 * client component silently yields undefined, so `requireServerEnv` also refuses
 * to run in the browser rather than producing a confusing downstream error.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

function requireServerEnv(name: string, value: string | undefined): string {
  if (typeof window !== "undefined") {
    throw new Error(
      `${name} is a server-only secret and must never be read in the browser.`,
    );
  }
  return required(name, value);
}

/**
 * The NEXT_PUBLIC_* reads below are written out literally on purpose. Next only
 * inlines these into the client bundle when the access is statically
 * analyzable — `process.env[someVariable]` is not, and silently becomes
 * undefined in the browser while continuing to work on the server.
 */
export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
};

export const serverEnv = {
  get supabaseSecretKey() {
    return requireServerEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  get tmdbAccessToken() {
    return requireServerEnv("TMDB_ACCESS_TOKEN", process.env.TMDB_ACCESS_TOKEN);
  },
  get openaiApiKey() {
    return requireServerEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  },
  get pineconeApiKey() {
    return requireServerEnv("PINECONE_API_KEY", process.env.PINECONE_API_KEY);
  },
  /** Index name is config, not a secret, so it gets a sensible default. */
  get pineconeIndexName() {
    return process.env.PINECONE_INDEX_NAME ?? "cinema-brain-movies";
  },
};
