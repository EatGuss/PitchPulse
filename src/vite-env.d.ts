/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIM_SECONDS_PER_MATCH_MINUTE?: string;
  readonly VITE_PROMPT_WINDOW_MS?: string;
  readonly VITE_APPSYNC_URL?: string;
  readonly VITE_APPSYNC_REGION?: string;
  readonly VITE_COGNITO_IDENTITY_POOL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
