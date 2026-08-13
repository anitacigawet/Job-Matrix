import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Minimize2, Maximize2, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: "server" | "local";
}

export const debugLog = {
  logs: [] as LogEntry[],
  listeners: new Set<(logs: LogEntry[]) => void>(),
  idCounter: 0,
  
  add(level: LogEntry["level"], message: string) {
    const entry: LogEntry = {
      id: `local-${this.idCounter++}`,
      timestamp: Date.now(),
      level,
      message,
      source: "local",
    };
    this.logs.push(entry);
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    this.listeners.forEach(listener => listener([...this.logs]));
  },
  
  info(message: string) { this.add("info", message); },
  error(message: string) { this.add("error", message); },
  warn(message: string) { this.add("warn", message); },
  debug(message: string) { this.add("debug", message); },
  
  clear() {
    this.logs = [];
    this.listeners.forEach(listener => listener([]));
  },
  
  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

export function DebugConsole() {
  const [localLogs, setLocalLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<"local" | "server">("local");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const localScrollRef = useRef<HTMLDivElement>(null);
  const serverScrollRef = useRef<HTMLDivElement>(null);
  
  // Poll for server logs every 2 seconds when Server tab is active
  const { data: recentLogs } = trpc.system.getRecentLogs.useQuery(
    { limit: 100 },
    { 
      enabled: activeTab === "server",
      refetchInterval: activeTab === "server" ? 2000 : false,
    }
  );
  
  const clearServerLogs = trpc.system.clearLogs.useMutation({
    onSuccess: () => setServerLogs([]),
  });

  useEffect(() => {
    const unsubscribe = debugLog.subscribe(setLocalLogs);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (recentLogs && activeTab === "server") {
      setServerLogs(recentLogs);
    }
  }, [recentLogs, activeTab]);

  useEffect(() => {
    if (localScrollRef.current && !isMinimized && activeTab === "local") {
      localScrollRef.current.scrollTop = localScrollRef.current.scrollHeight;
    }
  }, [localLogs, isMinimized, activeTab]);
  
  useEffect(() => {
    if (serverScrollRef.current && !isMinimized && activeTab === "server") {
      serverScrollRef.current.scrollTop = serverScrollRef.current.scrollHeight;
    }
  }, [serverLogs, isMinimized, activeTab]);

  if (!isVisible) return null;

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "info": return "text-blue-400";
      case "warn": return "text-yellow-400";
      case "error": return "text-red-400";
      case "debug": return "text-purple-400";
    }
  };

  const getLevelBg = (level: LogEntry["level"]) => {
    switch (level) {
      case "info": return "bg-blue-500/10";
      case "warn": return "bg-yellow-500/10";
      case "error": return "bg-red-500/10";
      case "debug": return "bg-purple-500/10";
    }
  };

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

  const handleClear = () => {
    if (activeTab === "local") {
      debugLog.clear();
    } else {
      clearServerLogs.mutate();
    }
  };

  const handleCopyLog = async (log: LogEntry) => {
    try {
      await navigator.clipboard.writeText(log.message);
      setCopiedId(log.id);
      toast.success("Log copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error("Failed to copy log");
    }
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg border-2 z-50 glass-card gap-1">
      <CardHeader className="py-1 px-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-mono gradient-text">Debug Console</CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleClear} className="h-6 w-6 p-0" title="Clear logs">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsMinimized(!isMinimized)} className="h-6 w-6 p-0">
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      {!isMinimized && (
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "local" | "server")} className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-8 p-0.5 mt-0">
              <TabsTrigger value="local">Local ({localLogs.length})</TabsTrigger>
              <TabsTrigger value="server">Server ({serverLogs.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="local" className="m-0">
              <div ref={localScrollRef} className="h-48 overflow-y-auto font-mono text-xs p-2 space-y-1">
                {localLogs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">No logs yet...</div>
                ) : (
                  localLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-2 rounded ${getLevelBg(log.level)} cursor-pointer hover:bg-opacity-80 transition-colors group relative`}
                      onClick={() => handleCopyLog(log)}
                      title="Click to copy"
                    >
                      <div className="flex gap-2 items-center">
                        <span className="text-muted-foreground">{formatTime(log.timestamp)}</span>
                        <span className={`font-semibold ${getLevelColor(log.level)}`}>[{log.level.toUpperCase()}]</span>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedId === log.id ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                        {log.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="server" className="m-0">
              <div ref={serverScrollRef} className="h-48 overflow-y-auto font-mono text-xs p-2 space-y-1">
                {serverLogs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">No logs yet...</div>
                ) : (
                  serverLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-2 rounded ${getLevelBg(log.level)} cursor-pointer hover:bg-opacity-80 transition-colors group relative`}
                      onClick={() => handleCopyLog(log)}
                      title="Click to copy"
                    >
                      <div className="flex gap-2 items-center">
                        <span className="text-muted-foreground">{formatTime(log.timestamp)}</span>
                        <span className={`font-semibold ${getLevelColor(log.level)}`}>[{log.level.toUpperCase()}]</span>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedId === log.id ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                        {log.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
