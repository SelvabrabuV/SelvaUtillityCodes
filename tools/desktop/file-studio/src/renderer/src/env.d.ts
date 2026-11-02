/// <reference types="vite/client" />

interface Window {
  studio: import('../../preload/index').StudioApi
  MonacoEnvironment?: {
    getWorker(workerId: string, label: string): Worker
  }
}
