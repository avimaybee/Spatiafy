import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndUpload(files[0]);
    }
  }, [onFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const validateAndUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, WEBP)');
      return;
    }
    onFileSelect(file);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div 
        className={`
          relative group cursor-pointer transition-all duration-300 ease-out
          border-2 border-dashed
          flex flex-col items-center justify-center text-center p-12 md:p-16
          ${isDragging 
            ? 'border-[#00f0ff] bg-[#00f0ff]/5 scale-[1.01]' 
            : 'border-black/20 hover:border-black hover:bg-black/5'
          }
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <div className="mb-8 relative">
            <div className={`absolute inset-0 bg-[#00f0ff] blur-2xl opacity-0 transition-opacity duration-500 ${isDragging ? 'opacity-30' : 'group-hover:opacity-10'}`}></div>
            <div className="relative z-10 w-20 h-20 border border-black flex items-center justify-center bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] group-hover:translate-x-[2px] group-hover:translate-y-[2px] transition-all">
                <Upload className="w-8 h-8 text-black" />
            </div>
        </div>
        
        <h2 className="font-work font-black text-4xl mb-3 tracking-tighter uppercase">
          Upload Photo
        </h2>
        <p className="font-mono text-xs text-black/60 mb-8 max-w-[280px] leading-relaxed mx-auto">
          DRAG & DROP OR CLICK <br/>
          SUPPORTS JPG, PNG, WEBP
        </p>

        <input 
          id="file-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
};