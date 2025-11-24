import React, { useMemo, useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture, Loader } from '@react-three/drei';
import * as THREE from 'three';
import { ProcessedImage } from '../types';
import { Download, Share2, ArrowLeft, Rotate3D } from 'lucide-react';
import { Button } from './Button';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

interface DepthViewerProps {
  data: ProcessedImage;
  onReset: () => void;
}

// ------------------------------------------------------------------
// 3D Scene Component
// ------------------------------------------------------------------

const ParallaxLayer = ({
  url,
  depthMapUrl,
  depth,
  scale = 1,
  opacity = 1,
  displacementScale = 0,
  data
}: {
  url: string,
  depthMapUrl?: string,
  depth: number,
  scale?: number,
  opacity?: number,
  displacementScale?: number,
  data: ProcessedImage
}) => {
  const texture = useTexture(url);
  const depthTexture = depthMapUrl ? useTexture(depthMapUrl) : null;
  const { viewport, camera } = useThree();

  // Memoize geometry scaling
  const [width, height] = useMemo(() => {
    const imgRatio = data.aspectRatio;
    const viewRatio = viewport.width / viewport.height;

    // Base size to cover viewport (contain style logic)
    let w, h;
    if (viewRatio > imgRatio) {
      // Viewport is wider than image
      h = viewport.height;
      w = h * imgRatio;
    } else {
      // Viewport is taller than image
      w = viewport.width;
      h = w / imgRatio;
    }

    // Scale Logic for Parallax:
    // Objects further away (negative Z) look smaller. 
    // We must scale them UP so they visually match the size of the object at Z=0.
    // Perspective formula: scale = 1 + (distanceFromZero / cameraDistance) roughly
    const cameraZ = camera.position.z;
    const distanceCorrection = Math.abs(depth) / cameraZ;
    const perspectiveScale = 1 + distanceCorrection;

    return [w * scale * perspectiveScale * 0.85, h * scale * perspectiveScale * 0.85];
  }, [viewport, data.aspectRatio, depth, scale, camera.position.z]);

  return (
    <mesh position={[0, 0, depth]}>
      {/* High segment count for displacement */}
      <planeGeometry args={[width, height, 256, 256]} />
      <meshStandardMaterial
        map={texture}
        transparent={true}
        opacity={opacity}
        side={THREE.DoubleSide}
        displacementMap={depthTexture || undefined}
        displacementScale={displacementScale}
      />
    </mesh>
  );
};

const ParallaxRig = () => {
  const { camera, mouse } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 0, 6)); // Initial camera pos

  // Gyro state
  const [gyro, setGyro] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      // Clamp and normalize tilt
      // beta: front-back motion [-180, 180] -> mapped to Y
      // gamma: left-right motion [-90, 90] -> mapped to X
      const x = Math.min(Math.max((event.gamma || 0) / 45, -1), 1);
      const y = Math.min(Math.max((event.beta || 0) / 45, -1), 1);
      setGyro({ x, y });
    };

    // Check if permission is needed (iOS 13+) - usually handled in UI, but we listen if available
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useFrame((state, delta) => {
    // Combine mouse and gyro
    // Mouse: -1 to 1. Gyro: -1 to 1.
    const isMobile = window.matchMedia("(pointer: coarse)").matches;

    let targetX = 0;
    let targetY = 0;

    if (isMobile) {
      targetX = gyro.x * 1.5;
      targetY = gyro.y * 1.5;
    } else {
      targetX = state.mouse.x;
      targetY = state.mouse.y;
    }

    // Smooth camera movement (Parallax effect)
    // We move camera opposite to input to make layers shift correctly
    // range: +/- 0.5 units
    targetPos.current.x = THREE.MathUtils.lerp(targetPos.current.x, targetX * 0.5, delta * 3);
    targetPos.current.y = THREE.MathUtils.lerp(targetPos.current.y, targetY * 0.5, delta * 3);

    camera.position.copy(targetPos.current);
    camera.lookAt(0, 0, 0);
  });

  return null;
};

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export const DepthViewer: React.FC<DepthViewerProps> = ({ data, onReset }) => {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

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
    <div className="relative w-full h-full bg-[#f0f0f0]">
      {/* 3D Canvas */}
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <ambientLight intensity={2} />
        <color attach="background" args={['#f0f0f0']} />

        <Suspense fallback={null}>
          <ParallaxLayer
            data={data}
            url={data.backgroundUrl}
            depth={-1.5}
            scale={1.2} // Slight overscale to prevent edges showing
          />
          <ParallaxLayer
            data={data}
            url={data.foregroundUrl}
            depthMapUrl={data.depthMapUrl}
            depth={0}
            displacementScale={0.5}
          />
          <ParallaxRig />
        </Suspense>
      </Canvas>

      {/* Loading Overlay for Textures */}
      <Loader
        containerStyles={{ background: '#f0f0f0' }}
        innerStyles={{ background: 'black', width: '200px' }}
        barStyles={{ background: '#00f0ff', height: '4px' }}
        dataStyles={{ fontFamily: 'Space Mono', fontSize: '10px', textTransform: 'uppercase' }}
      />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none z-10">
        <Button onClick={onReset} variant="outline" className="pointer-events-auto bg-white/80 backdrop-blur-md border-black/10">
          <ArrowLeft size={16} /> Back
        </Button>

        <div className="flex gap-2 pointer-events-auto">
          <Button variant="primary" className="bg-black text-white hover:bg-[#00f0ff] hover:text-black">
            <Share2 size={16} /> Share
          </Button>
          <Button variant="outline" className="bg-white/80 backdrop-blur-md border-black/10">
            <Download size={16} /> Save
          </Button>
        </div>
      </div>

      {/* Tilt Permission Prompt (iOS) */}
      {needsPermission && !permissionGranted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-8 max-w-sm text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-2 border-black">
            <Rotate3D className="w-12 h-12 mx-auto mb-4 text-[#00f0ff]" />
            <h3 className="font-work font-black text-xl mb-2">Enable 3D Magic</h3>
            <p className="font-mono text-xs mb-6 text-gray-600">
              Allow access to your device motion sensors to enable the spatial tilt effect.
            </p>
            <Button onClick={requestAccess} variant="primary" className="w-full">
              Allow Motion
            </Button>
          </div>
        </div>
      )}

      {/* Instructions Hint */}
      {permissionGranted && (
        <div className="absolute bottom-12 left-0 w-full text-center pointer-events-none animate-[fadeOut_1s_ease-out_3s_forwards]">
          <div className="inline-flex items-center gap-2 bg-black/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
            <Rotate3D size={14} className="animate-spin-slow" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-black/60">
              {needsPermission ? 'Tilt your device' : 'Move cursor to tilt'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};