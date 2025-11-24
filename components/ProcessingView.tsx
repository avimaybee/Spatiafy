import React, { useEffect, useRef } from 'react';
import { ProcessingLog } from '../types';

interface ProcessingViewProps {
  logs: ProcessingLog[];
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-xl mx-auto p-6">
      {/* Loading Spinner / Graphic */}
      <div className="mb-10 relative">
        <div className="w-32 h-32 border border-black/10 rounded-full animate-[spin_4s_linear_infinite]"></div>
        <div className="absolute inset-0 border-t-2 border-black rounded-full animate-[spin_1.5s_linear_infinite]"></div>
        <div className="absolute inset-4 border border-[#00f0ff]/50 rounded-full animate-[ping_2s_ease-out_infinite]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-black text-3xl tracking-tighter animate-pulse">AI</div>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="w-full bg-black text-[#00f0ff] font-mono text-xs md:text-sm p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.15)] border border-[#00f0ff]/20">
        <div className="flex items-center justify-between border-b border-[#00f0ff]/30 pb-3 mb-4">
          <div className="flex gap-2">
             <div className="w-2 h-2 rounded-full bg-red-500"></div>
             <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
             <div className="w-2 h-2 rounded-full bg-green-500"></div>
          </div>
          <span className="uppercase tracking-widest opacity-70 text-[10px]">process_stream.log</span>
        </div>
        
        <div ref={containerRef} className="h-40 overflow-y-auto space-y-2 no-scrollbar">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 animate-[fadeIn_0.2s_ease-out]">
              <span className="opacity-40 select-none">[{new Date(log.timestamp).toLocaleTimeString('en-US', {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span>
              <span><span className="text-white/50 mr-2">root@spatiafy:~#</span>{log.message}</span>
            </div>
          ))}
          <div className="animate-pulse">_</div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest opacity-40">
        <span>Generating Depth Map</span>
        <span className="w-1 h-1 bg-black rounded-full"></span>
        <span>Inpainting Background</span>
        <span className="w-1 h-1 bg-black rounded-full"></span>
        <span>Generative Fill</span>
      </div>
    </div>
  );
};