/// <reference types="vite/client" />

// Extend env typing to include our API base URL if needed
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
