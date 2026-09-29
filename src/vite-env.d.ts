/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEOSERVER_WMS?: string;
  readonly VITE_GEOSERVER_LAYER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}