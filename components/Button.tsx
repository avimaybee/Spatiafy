import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  icon,
  ...props 
}) => {
  const baseStyle = "font-mono font-bold text-sm tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 px-6 py-3 active:translate-y-0.5";
  
  const variants = {
    primary: "bg-black text-white border-2 border-transparent hover:bg-[#00f0ff] hover:text-black hover:border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
    outline: "bg-transparent text-black border-2 border-black hover:bg-black hover:text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
    ghost: "bg-transparent text-black hover:bg-black/5"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`} 
      {...props}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};