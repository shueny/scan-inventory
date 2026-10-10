/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: "api" | "static";
  readonly VITE_DATA_BASE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TILES_BASE_URL?: string;
  readonly VITE_DATA_VERSION?: string;
  readonly VITE_REPO_URL?: string;
  readonly VITE_DEMO_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
