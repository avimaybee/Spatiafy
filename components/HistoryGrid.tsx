import React from 'react';
import { ProcessedImage } from '../types';
import { Clock, ArrowRight } from 'lucide-react';

interface HistoryGridProps {
  items: ProcessedImage[];
  onSelect: (item: ProcessedImage) => void;
}

export const HistoryGrid: React.FC<HistoryGridProps> = ({ items, onSelect }) => {
  if (items.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 px-6 pb-12">
      <div className="flex items-center gap-2 mb-6 border-b border-black pb-2">
        <Clock className="w-4 h-4" />
        <h3 className="font-mono font-bold text-sm uppercase tracking-widest">Recent Memories</h3>
        <span className="ml-auto font-mono text-xs opacity-50">{items.length} SAVED</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.slice().reverse().map((item) => (
          <div 
            key={item.id} 
            className="group relative aspect-square bg-gray-200 cursor-pointer overflow-hidden border border-transparent hover:border-black transition-all"
            onClick={() => onSelect(item)}
          >
            <img 
              src={item.originalUrl} 
              alt="Memory" 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 grayscale group-hover:grayscale-0" 
            />
            
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="font-mono text-xs text-white uppercase flex items-center gap-1 border border-white px-2 py-1">
                View <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            
            {/* Corner Markers */}
            <div className="absolute top-1 left-1 w-2 h-2 border-t border-l border-white/50"></div>
            <div className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-white/50"></div>
          </div>
        ))}
      </div>
    </div>
  );
};