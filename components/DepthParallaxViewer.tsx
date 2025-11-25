import React, { useMemo, useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useTexture, Loader, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { ProcessedImage } from '../types';
import { Download, Share2, ArrowLeft, Rotate3D, Settings, Sparkles } from 'lucide-react';
import { Button } from './Button';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

interface DepthParallaxViewerProps {
  data: ProcessedImage;
  onReset: () => void;
}

interface ParallaxSettings {
  intensity: number;
  depthScale: number;
  enableDOF: boolean;
  enableVignette: boolean;
  smoothing: number;
}

// ------------------------------------------------------------------
// Custom Shader Material for Fake 3D Parallax Effect
// Based on Akella's Fake3D technique - UV displacement in fragment shader
// ------------------------------------------------------------------

const DepthParallaxMaterial = shaderMaterial(
  {
    // Uniforms
    uOriginalTexture: null,
    uDepthTexture: null,
    uMouse: new THREE.Vector2(0, 0),
    uIntensity: 0.15,
    uDepthScale: 1.0,
    uTime: 0,
    uResolution: new THREE.Vector2(1, 1),
    uEnableDOF: false,
    uEnableVignette: true,
  },
  // Vertex Shader
  /*glsl*/ `
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader - The magic happens here!
  /*glsl*/ `
    precision highp float;
    
    uniform sampler2D uOriginalTexture;
    uniform sampler2D uDepthTexture;
    uniform vec2 uMouse;
    uniform float uIntensity;
    uniform float uDepthScale;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform bool uEnableDOF;
    uniform bool uEnableVignette;
    
    varying vec2 vUv;
    
    // Mirror UV coordinates to prevent edge artifacts
    vec2 mirroredUV(vec2 uv) {
      vec2 m = mod(uv, 2.0);
      return mix(m, 2.0 - m, step(1.0, m));
    }
    
    // Soft depth-of-field blur based on depth
    vec4 sampleWithDOF(sampler2D tex, vec2 uv, float depth) {
      if (!uEnableDOF) {
        return texture2D(tex, uv);
      }
      
      // Objects further away (darker depth) get more blur
      float blurAmount = (1.0 - depth) * 0.003;
      
      vec4 color = vec4(0.0);
      float total = 0.0;
      
      // 9-tap blur kernel
      for (float x = -1.0; x <= 1.0; x += 1.0) {
        for (float y = -1.0; y <= 1.0; y += 1.0) {
          vec2 offset = vec2(x, y) * blurAmount;
          color += texture2D(tex, mirroredUV(uv + offset));
          total += 1.0;
        }
      }
      
      return color / total;
    }
    
    // Vignette effect for cinematic look
    float vignette(vec2 uv) {
      vec2 center = uv - 0.5;
      float dist = length(center);
      return 1.0 - smoothstep(0.4, 0.8, dist);
    }
    
    void main() {
      // Sample depth at current UV
      vec4 depthSample = texture2D(uDepthTexture, vUv);
      float depth = depthSample.r; // Grayscale depth map
      
      // THE CORE PARALLAX EFFECT:
      // Offset UV coordinates based on:
      // - depth value (brighter = closer = more movement)
      // - mouse position (direction of offset)
      // - intensity (scale of the effect)
      //
      // depth - 0.5 centers the effect so mid-gray is neutral
      // Closer objects (white/bright) move more with mouse
      // Further objects (dark) stay more stationary
      
      float depthOffset = (depth - 0.5) * uDepthScale;
      vec2 parallaxOffset = uMouse * depthOffset * uIntensity;
      
      // Apply parallax displacement to UV
      vec2 displaceUV = vUv + parallaxOffset;
      
      // Sample original texture with displaced UV (mirrored to avoid edge artifacts)
      vec4 color = sampleWithDOF(uOriginalTexture, mirroredUV(displaceUV), depth);
      
      // Apply vignette
      if (uEnableVignette) {
        float vig = vignette(vUv);
        color.rgb *= mix(0.7, 1.0, vig);
      }
      
      // Subtle color grading for aesthetic appeal
      color.rgb = pow(color.rgb, vec3(0.98)); // Slight gamma adjustment
      
      gl_FragColor = color;
    }
  `
);

// Extend React Three Fiber to recognize our custom material
extend({ DepthParallaxMaterial });

// ------------------------------------------------------------------
// Multi-Layer Parallax Material (Advanced - splits depth into layers)
// ------------------------------------------------------------------

const MultiLayerParallaxMaterial = shaderMaterial(
  {
    uOriginalTexture: null,
    uForegroundTexture: null,
    uBackgroundTexture: null,
    uDepthTexture: null,
    uMask: null,
    uMouse: new THREE.Vector2(0, 0),
    uIntensity: 0.2,
    uForegroundScale: 1.0,
    uBackgroundScale: 2.5,
    uTime: 0,
    uEnableVignette: true,
    uEnableDOF: true,
    uAspectRatio: 1.0,
  },
  // Vertex Shader
  /*glsl*/ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader - Multi-layer parallax
  /*glsl*/ `
    precision highp float;
    
    uniform sampler2D uOriginalTexture;
    uniform sampler2D uForegroundTexture;
    uniform sampler2D uBackgroundTexture;
    uniform sampler2D uDepthTexture;
    uniform sampler2D uMask;
    uniform vec2 uMouse;
    uniform float uIntensity;
    uniform float uForegroundScale;
    uniform float uBackgroundScale;
    uniform float uTime;
    uniform bool uEnableVignette;
    uniform bool uEnableDOF;
    uniform float uAspectRatio;
    
    varying vec2 vUv;
    
    // Smooth clamp for UV
    vec2 clampUV(vec2 uv) {
      return clamp(uv, 0.001, 0.999);
    }
    
    // Mirror UV to prevent edge artifacts
    vec2 mirroredUV(vec2 uv) {
      vec2 m = mod(uv, 2.0);
      return mix(m, 2.0 - m, step(1.0, m));
    }
    
    // Gaussian blur for depth-of-field
    vec4 blur5(sampler2D tex, vec2 uv, vec2 resolution, vec2 direction) {
      vec4 color = vec4(0.0);
      vec2 off1 = vec2(1.3333333333333333) * direction;
      color += texture2D(tex, uv) * 0.29411764705882354;
      color += texture2D(tex, uv + (off1 / resolution)) * 0.35294117647058826;
      color += texture2D(tex, uv - (off1 / resolution)) * 0.35294117647058826;
      return color;
    }
    
    // Vignette effect
    float vignette(vec2 uv) {
      vec2 center = uv - 0.5;
      // Correct for aspect ratio
      center.x *= uAspectRatio;
      float dist = length(center);
      return 1.0 - smoothstep(0.35, 0.75, dist * 0.8);
    }
    
    // Film grain effect
    float grain(vec2 uv, float time) {
      return fract(sin(dot(uv, vec2(12.9898, 78.233)) + time) * 43758.5453) * 0.03 - 0.015;
    }
    
    void main() {
      // Sample depth and mask
      float depth = texture2D(uDepthTexture, vUv).r;
      float mask = texture2D(uMask, vUv).r;
      
      // Calculate parallax offsets for each layer
      // Background: stronger parallax (moves opposite to mouse)
      // Foreground: weaker parallax (moves with mouse slightly)
      
      vec2 bgOffset = uMouse * uIntensity * uBackgroundScale * -0.5;
      vec2 fgOffset = uMouse * uIntensity * uForegroundScale * (depth - 0.5);
      
      // Sample textures with parallax
      vec2 bgUV = mirroredUV(vUv + bgOffset);
      vec2 fgUV = mirroredUV(vUv + fgOffset);
      
      vec4 bgColor = texture2D(uBackgroundTexture, bgUV);
      vec4 fgColor = texture2D(uForegroundTexture, fgUV);
      
      // Depth-based blur on background
      if (uEnableDOF) {
        vec2 res = vec2(1024.0);
        bgColor = blur5(uBackgroundTexture, bgUV, res, vec2(1.0, 0.0));
        bgColor += blur5(uBackgroundTexture, bgUV, res, vec2(0.0, 1.0));
        bgColor *= 0.5;
      }
      
      // Composite: background + foreground using mask alpha
      vec4 color = mix(bgColor, fgColor, fgColor.a);
      
      // Apply vignette
      if (uEnableVignette) {
        float vig = vignette(vUv);
        color.rgb *= mix(0.6, 1.0, vig);
      }
      
      // Subtle film grain for aesthetic
      float g = grain(vUv, uTime);
      color.rgb += g;
      
      // Color grading - slight warmth
      color.r *= 1.02;
      color.b *= 0.98;
      
      gl_FragColor = color;
    }
  `
);

extend({ MultiLayerParallaxMaterial });

// ------------------------------------------------------------------
// Simple Parallax Scene (Single Image + Depth Map)
// ------------------------------------------------------------------

const SimpleParallaxScene = ({ 
  data, 
  settings 
}: { 
  data: ProcessedImage; 
  settings: ParallaxSettings 
}) => {
  const materialRef = useRef<any>(null);
  const { viewport, size } = useThree();
  
  // Load textures
  const originalTexture = useTexture(data.originalUrl);
  const depthTexture = useTexture(data.depthMapUrl);
  
  // Mouse/gyro state
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const targetMouseRef = useRef(new THREE.Vector2(0, 0));
  
  // Gyroscope handling
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const x = Math.min(Math.max((event.gamma || 0) / 30, -1), 1);
      const y = Math.min(Math.max((event.beta || 0) / 30, -1), 1);
      targetMouseRef.current.set(x, y);
    };
    
    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -((event.clientY / window.innerHeight) * 2 - 1);
      targetMouseRef.current.set(x * 0.8, y * 0.8);
    };
    
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Animation loop
  useFrame((state, delta) => {
    if (!materialRef.current) return;
    
    // Smooth interpolation (lerp) for mouse movement
    const lerpFactor = 1 - Math.pow(0.001, delta * settings.smoothing);
    mouseRef.current.lerp(targetMouseRef.current, lerpFactor);
    
    // Update uniforms
    materialRef.current.uMouse = mouseRef.current;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uIntensity = settings.intensity;
    materialRef.current.uDepthScale = settings.depthScale;
    materialRef.current.uEnableDOF = settings.enableDOF;
    materialRef.current.uEnableVignette = settings.enableVignette;
  });
  
  // Calculate plane dimensions to fill viewport while maintaining aspect ratio
  const [planeWidth, planeHeight] = useMemo(() => {
    const imageAspect = data.aspectRatio;
    const viewportAspect = viewport.width / viewport.height;
    
    let w, h;
    if (viewportAspect > imageAspect) {
      // Viewport is wider - fit to width
      w = viewport.width;
      h = viewport.width / imageAspect;
    } else {
      // Viewport is taller - fit to height
      h = viewport.height;
      w = viewport.height * imageAspect;
    }
    
    // Slightly oversized to allow parallax movement without showing edges
    return [w * 1.15, h * 1.15];
  }, [viewport, data.aspectRatio]);
  
  return (
    <mesh>
      <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
      <depthParallaxMaterial
        ref={materialRef}
        key={DepthParallaxMaterial.key}
        uOriginalTexture={originalTexture}
        uDepthTexture={depthTexture}
        uResolution={new THREE.Vector2(size.width, size.height)}
        transparent={false}
      />
    </mesh>
  );
};

// ------------------------------------------------------------------
// Multi-Layer Parallax Scene (Foreground + Background)
// ------------------------------------------------------------------

const MultiLayerParallaxScene = ({ 
  data, 
  settings 
}: { 
  data: ProcessedImage; 
  settings: ParallaxSettings 
}) => {
  const materialRef = useRef<any>(null);
  const { viewport, size } = useThree();
  
  // Load all textures
  const originalTexture = useTexture(data.originalUrl);
  const foregroundTexture = useTexture(data.foregroundUrl);
  const backgroundTexture = useTexture(data.backgroundUrl);
  const depthTexture = useTexture(data.depthMapUrl);
  
  // Create a mask from the foreground texture's alpha
  const maskTexture = foregroundTexture;
  
  // Mouse state
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const targetMouseRef = useRef(new THREE.Vector2(0, 0));
  
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const x = Math.min(Math.max((event.gamma || 0) / 25, -1), 1);
      const y = Math.min(Math.max((event.beta || 0) / 25, -1), 1);
      targetMouseRef.current.set(x, y);
    };
    
    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -((event.clientY / window.innerHeight) * 2 - 1);
      targetMouseRef.current.set(x * 0.7, y * 0.7);
    };
    
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  useFrame((state, delta) => {
    if (!materialRef.current) return;
    
    const lerpFactor = 1 - Math.pow(0.001, delta * settings.smoothing);
    mouseRef.current.lerp(targetMouseRef.current, lerpFactor);
    
    materialRef.current.uMouse = mouseRef.current;
    materialRef.current.uTime = state.clock.elapsedTime;
    materialRef.current.uIntensity = settings.intensity;
    materialRef.current.uEnableDOF = settings.enableDOF;
    materialRef.current.uEnableVignette = settings.enableVignette;
  });
  
  const [planeWidth, planeHeight] = useMemo(() => {
    const imageAspect = data.aspectRatio;
    const viewportAspect = viewport.width / viewport.height;
    
    let w, h;
    if (viewportAspect > imageAspect) {
      w = viewport.width;
      h = viewport.width / imageAspect;
    } else {
      h = viewport.height;
      w = viewport.height * imageAspect;
    }
    
    return [w * 1.2, h * 1.2];
  }, [viewport, data.aspectRatio]);
  
  return (
    <mesh>
      <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
      <multiLayerParallaxMaterial
        ref={materialRef}
        key={MultiLayerParallaxMaterial.key}
        uOriginalTexture={originalTexture}
        uForegroundTexture={foregroundTexture}
        uBackgroundTexture={backgroundTexture}
        uDepthTexture={depthTexture}
        uMask={maskTexture}
        uAspectRatio={data.aspectRatio}
        transparent={true}
      />
    </mesh>
  );
};

// ------------------------------------------------------------------
// Settings Panel Component
// ------------------------------------------------------------------

const SettingsPanel = ({ 
  settings, 
  onSettingsChange, 
  isOpen, 
  onToggle 
}: {
  settings: ParallaxSettings;
  onSettingsChange: (settings: ParallaxSettings) => void;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="absolute right-6 top-20 z-20 w-64 bg-white/95 backdrop-blur-md border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
      <h3 className="font-work font-black text-sm mb-4 uppercase tracking-wide">Effect Settings</h3>
      
      <div className="space-y-4">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-gray-600 block mb-1">
            Intensity: {settings.intensity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.05"
            max="0.4"
            step="0.01"
            value={settings.intensity}
            onChange={(e) => onSettingsChange({ ...settings, intensity: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
          />
        </div>
        
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-gray-600 block mb-1">
            Depth Scale: {settings.depthScale.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={settings.depthScale}
            onChange={(e) => onSettingsChange({ ...settings, depthScale: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
          />
        </div>
        
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-gray-600 block mb-1">
            Smoothing: {settings.smoothing.toFixed(0)}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={settings.smoothing}
            onChange={(e) => onSettingsChange({ ...settings, smoothing: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] uppercase tracking-widest text-gray-600">
            Depth of Field
          </label>
          <button
            onClick={() => onSettingsChange({ ...settings, enableDOF: !settings.enableDOF })}
            className={`w-10 h-5 rounded-full transition-colors ${
              settings.enableDOF ? 'bg-[#00f0ff]' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
              settings.enableDOF ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="font-mono text-[10px] uppercase tracking-widest text-gray-600">
            Vignette
          </label>
          <button
            onClick={() => onSettingsChange({ ...settings, enableVignette: !settings.enableVignette })}
            className={`w-10 h-5 rounded-full transition-colors ${
              settings.enableVignette ? 'bg-[#00f0ff]' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
              settings.enableVignette ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export const DepthParallaxViewer: React.FC<DepthParallaxViewerProps> = ({ data, onReset }) => {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [useMultiLayer, setUseMultiLayer] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ParallaxSettings>({
    intensity: 0.15,
    depthScale: 1.5,
    enableDOF: true,
    enableVignette: true,
    smoothing: 5,
  });

  useEffect(() => {
    // Check if we need to ask for permission (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      (DeviceOrientationEvent as any).requestPermission
    ) {
      setNeedsPermission(true);
    } else {
      setPermissionGranted(true);
    }
  }, []);

  const requestAccess = async () => {
    try {
      const response = await (DeviceOrientationEvent as any).requestPermission();
      if (response === 'granted') {
        setPermissionGranted(true);
        setNeedsPermission(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a]">
      {/* 3D Canvas */}
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ 
          antialias: true, 
          toneMapping: THREE.NoToneMapping,
          alpha: false,
          powerPreference: 'high-performance'
        }}
      >
        <color attach="background" args={['#0a0a0a']} />
        
        <Suspense fallback={null}>
          {useMultiLayer ? (
            <MultiLayerParallaxScene data={data} settings={settings} />
          ) : (
            <SimpleParallaxScene data={data} settings={settings} />
          )}
        </Suspense>
      </Canvas>

      {/* Loading Overlay for Textures */}
      <Loader
        containerStyles={{ background: '#0a0a0a' }}
        innerStyles={{ background: '#1a1a1a', width: '200px' }}
        barStyles={{ background: '#00f0ff', height: '4px' }}
        dataStyles={{ 
          fontFamily: 'Space Mono, monospace', 
          fontSize: '10px', 
          textTransform: 'uppercase',
          color: '#fff'
        }}
      />

      {/* Settings Panel */}
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={showSettings}
        onToggle={() => setShowSettings(!showSettings)}
      />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none z-10">
        <Button 
          onClick={onReset} 
          variant="outline" 
          className="pointer-events-auto bg-white/90 backdrop-blur-md border-black/20 hover:bg-white"
        >
          <ArrowLeft size={16} /> Back
        </Button>

        <div className="flex gap-2 pointer-events-auto">
          <Button 
            onClick={() => setShowSettings(!showSettings)}
            variant="outline" 
            className={`bg-white/90 backdrop-blur-md border-black/20 ${showSettings ? 'ring-2 ring-[#00f0ff]' : ''}`}
          >
            <Settings size={16} />
          </Button>
          
          <Button 
            onClick={() => setUseMultiLayer(!useMultiLayer)}
            variant="outline" 
            className="bg-white/90 backdrop-blur-md border-black/20"
            title={useMultiLayer ? 'Switch to Simple Mode' : 'Switch to Multi-Layer Mode'}
          >
            <Sparkles size={16} />
          </Button>
          
          <Button variant="primary" className="bg-black text-white hover:bg-[#00f0ff] hover:text-black">
            <Share2 size={16} /> Share
          </Button>
          
          <Button variant="outline" className="bg-white/90 backdrop-blur-md border-black/20">
            <Download size={16} /> Save
          </Button>
        </div>
      </div>

      {/* Mode Indicator */}
      <div className="absolute bottom-24 left-6 pointer-events-none z-10">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/80">
            {useMultiLayer ? '◆ Multi-Layer Parallax' : '○ Simple Parallax'}
          </span>
        </div>
      </div>

      {/* Tilt Permission Prompt (iOS) */}
      {needsPermission && !permissionGranted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white p-8 max-w-sm text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-2 border-black">
            <Rotate3D className="w-12 h-12 mx-auto mb-4 text-[#00f0ff]" />
            <h3 className="font-work font-black text-xl mb-2">Enable 3D Magic</h3>
            <p className="font-mono text-xs mb-6 text-gray-600">
              Allow access to your device motion sensors for the immersive spatial tilt effect.
            </p>
            <Button onClick={requestAccess} variant="primary" className="w-full">
              Allow Motion
            </Button>
          </div>
        </div>
      )}

      {/* Instructions Hint */}
      {permissionGranted && (
        <div className="absolute bottom-12 left-0 w-full text-center pointer-events-none animate-[fadeOut_1s_ease-out_4s_forwards]">
          <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <Rotate3D size={14} className="animate-spin-slow text-[#00f0ff]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/70">
              {needsPermission ? 'Tilt your device' : 'Move cursor to explore'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepthParallaxViewer;
