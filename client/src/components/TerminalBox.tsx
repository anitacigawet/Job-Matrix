import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

export interface TerminalBoxProps {
  title: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
  progress?: { current: number; total: number };
  spawnFrom?: { x: number; y: number; width: number; height: number };
  onComplete?: () => void;
  id?: string;
}

export function TerminalBox({
  title,
  status,
  message,
  progress,
  spawnFrom,
  onComplete,
}: TerminalBoxProps) {
  const [isSpawning, setIsSpawning] = useState(true);

  useEffect(() => {
    // Spawn animation completes after 300ms
    const timer = setTimeout(() => setIsSpawning(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === 'completed' && onComplete) {
      // Wait 1 second after completion before calling onComplete
      const timer = setTimeout(() => {
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, onComplete]);

  // Calculate spawn animation styles
  const getSpawnStyles = () => {
    if (!spawnFrom || !isSpawning) return {};
    
    return {
      transform: `translate(${spawnFrom.x}px, ${spawnFrom.y}px) scale(0.1)`,
      width: spawnFrom.width,
      height: spawnFrom.height,
      opacity: 0,
    };
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'error':
        return <span className="text-red-400">✗</span>;
      default:
        return <span className="text-gray-400">○</span>;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'border-yellow-500/50 shadow-yellow-500/20';
      case 'completed':
        return 'border-green-500/50 shadow-green-500/20';
      case 'error':
        return 'border-red-500/50 shadow-red-500/20';
      default:
        return 'border-gray-500/30';
    }
  };



  return (
    <div
      className={`
        terminal-box
        bg-black/90 backdrop-blur-sm
        border ${getStatusColor()}
        rounded-md p-3
        font-mono text-xs
        transition-all duration-300 ease-out
        ${status === 'running' ? 'shadow-lg' : ''}
        ${isSpawning ? 'spawning' : ''}
        animate-fade-in
      `}
      style={{
        ...(isSpawning ? getSpawnStyles() : {}),
      }}
    >
      {/* Title Bar */}
      <div className="flex items-center gap-2 mb-1">
        {getStatusIcon()}
        <span className="text-green-400 font-semibold">{title}</span>
      </div>

      {/* Message */}
      {message && (
        <div className="text-gray-300 pl-6">
          {message}
        </div>
      )}

      {/* Progress Bar */}
      {progress && status === 'running' && (
        <div className="pl-6 mt-1">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <span className="text-yellow-400">
              {progress.current}/{progress.total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export interface TerminalFeedProps {
  boxes: TerminalBoxProps[];
  className?: string;
}

export function TerminalFeed({ boxes, className = '' }: TerminalFeedProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {boxes.map((box, index) => (
        <TerminalBox 
          key={`${box.title}-${index}`}
          title={box.title}
          status={box.status}
          message={box.message}
          progress={box.progress}
          spawnFrom={box.spawnFrom}
          onComplete={box.onComplete}
        />
      ))}
    </div>
  );
}
