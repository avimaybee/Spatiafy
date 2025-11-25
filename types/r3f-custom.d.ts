import { Object3DNode, MaterialNode, extend } from '@react-three/fiber';
import * as THREE from 'three';

// Declare custom shader materials for React Three Fiber
declare module '@react-three/fiber' {
  interface ThreeElements {
    depthParallaxMaterial: MaterialNode<THREE.ShaderMaterial, typeof THREE.ShaderMaterial>;
    multiLayerParallaxMaterial: MaterialNode<THREE.ShaderMaterial, typeof THREE.ShaderMaterial>;
  }
}

// Also declare in JSX namespace for broader compatibility
declare global {
  namespace JSX {
    interface IntrinsicElements {
      depthParallaxMaterial: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<any>;
        key?: React.Key;
        uOriginalTexture?: THREE.Texture | null;
        uDepthTexture?: THREE.Texture | null;
        uMouse?: THREE.Vector2;
        uIntensity?: number;
        uDepthScale?: number;
        uTime?: number;
        uResolution?: THREE.Vector2;
        uEnableDOF?: boolean;
        uEnableVignette?: boolean;
        transparent?: boolean;
        [key: string]: any;
      };
      multiLayerParallaxMaterial: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<any>;
        key?: React.Key;
        uOriginalTexture?: THREE.Texture | null;
        uForegroundTexture?: THREE.Texture | null;
        uBackgroundTexture?: THREE.Texture | null;
        uDepthTexture?: THREE.Texture | null;
        uMask?: THREE.Texture | null;
        uMouse?: THREE.Vector2;
        uIntensity?: number;
        uForegroundScale?: number;
        uBackgroundScale?: number;
        uTime?: number;
        uEnableVignette?: boolean;
        uEnableDOF?: boolean;
        uAspectRatio?: number;
        transparent?: boolean;
        [key: string]: any;
      };
    }
  }
}

export {};
