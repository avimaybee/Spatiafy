import React, { useState, useCallback } from 'react';
import { UploadZone } from './components/UploadZone';
import { ProcessingView } from './components/ProcessingView';
import { DepthViewer } from './components/DepthViewer';
import { HistoryGrid } from './components/HistoryGrid';
import { AppState, ProcessedImage, ProcessingLog } from './types';
import { processImage } from './services/imageProcessor';
import { Layers, Github } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [result, setResult] = useState<ProcessedImage | null>(null);
  const [history, setHistory] = useState<ProcessedImage[]>([]);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, { id: Math.random().toString(36), message, timestamp: Date.now() }]);
  }, []);

  const handleFileSelect = async (file: File) => {
    setState(AppState.PROCESSING);
    setLogs([]);
    addLog(`Initiating upload: ${file.name}`);

    try {
      const processedData = await processImage(file, addLog);
      
      setResult(processedData);
      setHistory(prev => [...prev, processedData]);
      
      addLog('Finalizing spatial scene...');
      setTimeout(() => setState(AppState.VIEWING), 800);
    } catch (error) {
      console.error(error);
      addLog(`CRITICAL ERROR: ${error}`);
      setState(AppState.ERROR);
      setTimeout(() => setState(AppState.IDLE), 3000);
    }
  };

  const handleReset = () => {
    // Return to gallery/idle, but keep result available in history
    setResult(null);
    setLogs([]);
    setState(AppState.IDLE);
  };

  const handleSelectFromHistory = (item: ProcessedImage) => {
    setResult(item);
    setState(AppState.VIEWING);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden flex flex-col bg-[#f0f0f0] text-[#1a1a1a]">
      {/* Header - Hidden in viewing mode for immersion */}
      {state !== AppState.VIEWING && (
        <header className="flex-none w-full p-6 md:p-8 flex justify-between items-center z-10 animate-[slideDown_0.5s_ease-out]">
          <div className="flex items-center gap-4">
            <div className="bg-black text-white p-2.5 shadow-[4px_4px_0px_0px_#00f0ff] transition-transform hover:-translate-y-0.5">
               <Layers size={24} strokeWidth={1.5} />
            </div>
            <div className="flex flex-col">
              <h1 className="font-work font-black text-3xl tracking-tighter leading-none">DEPTH-IFY</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-[#00f0ff] animate-pulse rounded-full"></span>
                <p className="font-mono text-[10px] tracking-[0.2em] font-bold opacity-60">SPATIAL MEMORY ENGINE</p>
              </div>
            </div>
          </div>
          <div className="hidden md:block">
             <a href="https://github.com/avimaybee" target="_blank" rel="noreferrer" className="flex items-center gap-2 font-mono text-xs hover:bg-black hover:text-white px-3 py-1.5 border border-transparent hover:border-black transition-all group">
                <Github size={14} />
                <span>@avimaybee</span>
             </a>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-1 w-full relative z-0 overflow-y-auto no-scrollbar scroll-smooth flex flex-col">
        {state === AppState.IDLE && (
          // Use min-h-full with flex-col. Replaced justify-center with my-auto on inner wrapper to prevent clipping on overflow.
          <div className="w-full min-h-full flex flex-col items-center py-12 md:py-16">
            <div className="my-auto w-full flex flex-col items-center gap-8">
               <UploadZone onFileSelect={handleFileSelect} />
               <HistoryGrid items={history} onSelect={handleSelectFromHistory} />
            </div>
          </div>
        )}

        {state === AppState.PROCESSING && (
           <div className="w-full h-full flex items-center justify-center">
             <ProcessingView logs={logs} />
           </div>
        )}

        {state === AppState.VIEWING && result && (
          <div className="absolute inset-0 w-full h-full animate-[zoomIn_0.3s_ease-out]">
            <DepthViewer data={result} onReset={handleReset} />
          </div>
        )}

        {state === AppState.ERROR && (
           <div className="w-full h-full flex items-center justify-center p-4">
             <div className="text-center p-12 bg-white border-4 border-red-500 shadow-[8px_8px_0px_0px_#ff0000] font-mono animate-[shake_0.5s_ease-in-out]">
               <h2 className="font-bold text-2xl mb-4 text-red-600 uppercase">System Failure</h2>
               <p className="text-sm">Processing sequence interrupted.</p>
               <p className="text-xs mt-2 opacity-50">Resetting interface...</p>
             </div>
           </div>
        )}
      </div>

      {/* Footer - Only visible in Idle */}
      {state === AppState.IDLE && (
        <footer className="flex-none w-full py-4 text-center z-10 bg-[#f0f0f0]">
          <p className="font-mono text-[10px] text-black/40 uppercase tracking-widest">
            Made by <a href="https://github.com/avimaybee" target="_blank" rel="noreferrer" className="hover:text-black underline decoration-dotted">@avimaybee</a> on GitHub
          </p>
        </footer>
      )}
    </main>
  );
};

export default App;