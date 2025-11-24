export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  VIEWING = 'VIEWING',
  ERROR = 'ERROR'
}

export interface ProcessingLog {
  id: string;
  message: string;
  timestamp: number;
}

export interface ProcessedImage {
  id: string;
  timestamp: number;
  originalUrl: string;
  foregroundUrl: string; // The segmented subject
  backgroundUrl: string; // The inpainted background
  depthMapUrl: string;
  aspectRatio: number;
  width: number;
  height: number;
  name?: string;
}

// Configuration for the parallax effect
export const PARALLAX_CONFIG = {
  layers: [
    { depth: -2, scale: 1.3, id: 'bg' }, // Background pushed back
    { depth: 0, scale: 1.0, id: 'fg' }     // Foreground at zero
  ]
};