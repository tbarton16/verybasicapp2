import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { type ExecutionResult } from "@shared/schema";
import { 
  Play, 
  Square, 
  Bot, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Download,
  Trash2,
  Loader2
} from "lucide-react";

export default function Home() {
  const [sessionId] = useState(() => "demo-session-main");
  const { toast } = useToast();

  // Status polling query
  const { data: executionStatus, isLoading: statusLoading } = useQuery<{
    isRunning: boolean;
    currentPrompt: number;
    totalPrompts: number;
    error: string | null;
    completed: boolean;
  }>({
    queryKey: [`/api/execution-status/${sessionId}`],
    refetchInterval: 1000, // Poll every second
    enabled: true,
  });

  const isRunning = executionStatus?.isRunning || false;
  const currentPrompt = executionStatus?.currentPrompt || 0;
  const totalPrompts = executionStatus?.totalPrompts || 0;
  const hasError = executionStatus?.error;
  const isCompleted = executionStatus?.completed;

  // Handle status changes
  useEffect(() => {
    if (hasError) {
      toast({ 
        title: "Execution error", 
        description: hasError,
        variant: "destructive"
      });
    } else if (isCompleted && !isRunning && totalPrompts > 0) {
      toast({ 
        title: "Execution completed", 
        description: "All prompts have been processed successfully."
      });
    }
  }, [hasError, isCompleted, isRunning, totalPrompts, toast]);

  // Queries and mutations
  const { data: promptsCount } = useQuery<{ count: number }>({
    queryKey: ['/api/prompts/count'],
    staleTime: Infinity,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery<ExecutionResult[]>({
    queryKey: [`/api/execution-results/${sessionId}`],
    staleTime: 0,
    refetchInterval: 1000, // Always poll for results
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/start-execution', { sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/execution-status', sessionId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start execution",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/stop-execution', { sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/execution-status', sessionId] });
      toast({ title: "Execution stopped", description: "Prompt execution has been stopped." });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop execution",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/execution-results/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/execution-results', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/execution-status', sessionId] });
      toast({ title: "Results cleared", description: "All execution results have been cleared." });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear results",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStart = () => {
    startMutation.mutate();
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  const handleClear = () => {
    clearMutation.mutate();
  };

  const progressPercentage = totalPrompts > 0 ? (currentPrompt / totalPrompts) * 100 : 0;

  const getStatusBadge = (result: ExecutionResult) => {
    switch (result.status) {
      case 'success':
        return (
          <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="bg-error/10 text-error border-error/20">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDuration = (duration: number | null) => {
    if (!duration) return 'N/A';
    return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Bot className="text-white w-4 h-4" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">AI Prompt Runner</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  isRunning 
                    ? 'bg-success animate-pulse' 
                    : 'bg-slate-400'
                }`} />
                <span className="text-sm text-slate-600 capitalize">
                  {isRunning ? 'Running' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Control Panel */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Prompt Execution Control</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Execute prompts from server file against OpenAI-compatible endpoint
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Total Prompts</div>
                <div className="text-2xl font-bold text-slate-900">
                  {(promptsCount as { count: number } | undefined)?.count || 0}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 mb-4">
              <Button
                onClick={handleStart}
                disabled={isRunning || startMutation.isPending}
                className="bg-primary hover:bg-blue-700 text-white px-6 py-3 shadow-sm hover:shadow-md"
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {isRunning ? 'Running...' : 'Start Execution'}
              </Button>

              <Button
                onClick={handleStop}
                disabled={!isRunning || stopMutation.isPending}
                variant="secondary"
                className="px-6 py-3 shadow-sm"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Square className="w-4 h-4 mr-2" />
                )}
                Stop
              </Button>

              <div className="flex-1" />

              {isRunning && totalPrompts > 0 && (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm text-slate-600">
                      Processing prompt <span className="font-medium">{currentPrompt}</span> of{' '}
                      <span className="font-medium">{totalPrompts}</span>
                    </span>
                  </div>
                  <div className="w-64">
                    <Progress value={progressPercentage} className="h-2" />
                  </div>
                </div>
              )}
            </div>

            {/* Status Messages */}
            {results.length > 0 && (
              <div className="space-y-2">
                {results.every(r => r.status === 'success') && !isRunning && (
                  <div className="bg-success/10 border border-success/20 text-success rounded-lg p-3 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">All prompts executed successfully!</span>
                  </div>
                )}
                
                {results.some(r => r.status === 'error') && !isRunning && (
                  <div className="bg-warning/10 border border-warning/20 text-warning rounded-lg p-3 flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">Some prompts failed. Review the results below.</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Display */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Execution Results</h2>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700">
                <Download className="w-4 h-4 mr-2" />
                Export Results
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClear}
                disabled={clearMutation.isPending || results.length === 0}
                className="text-slate-500 hover:text-slate-700"
              >
                {clearMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Clear All
              </Button>
            </div>
          </div>

          {resultsLoading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-4" />
                <p className="text-slate-500">Loading results...</p>
              </CardContent>
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">No executions yet</h3>
                <p className="text-slate-500 mb-6">
                  Click "Start Execution" to begin processing prompts from your server file.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {results.map((result) => (
                <Card 
                  key={result.id} 
                  className={`overflow-hidden hover:shadow-md transition-shadow ${
                    result.status === 'pending' ? 'border-l-4 border-l-primary' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                          result.status === 'success' 
                            ? 'bg-primary/10 text-primary'
                            : result.status === 'error'
                            ? 'bg-error/10 text-error'
                            : 'bg-primary/10 text-primary'
                        }`}>
                          {result.status === 'pending' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            result.promptIndex
                          )}
                        </div>
                        <h3 className="font-medium text-slate-900">
                          Prompt Execution #{result.promptIndex}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(result)}
                        <span className="text-xs text-slate-500">
                          {formatDuration(result.duration)}
                        </span>
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="mb-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Terminal className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">Prompt</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm text-slate-800 border border-slate-200">
                        {result.prompt}
                      </div>
                    </div>

                    {/* Response or Error */}
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        {result.status === 'error' ? (
                          <AlertTriangle className="w-4 h-4 text-error" />
                        ) : result.status === 'pending' ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                          <Bot className="w-4 h-4 text-primary" />
                        )}
                        <span className="text-sm font-medium text-slate-700">
                          {result.status === 'error' 
                            ? 'Error Details' 
                            : result.status === 'pending'
                            ? 'Awaiting Response'
                            : 'AI Response'}
                        </span>
                        {result.tokens && (
                          <span className="text-xs text-slate-500 ml-2">
                            {result.tokens} tokens
                          </span>
                        )}
                      </div>
                      <div className={`rounded-lg p-4 text-sm border leading-relaxed ${
                        result.status === 'error'
                          ? 'bg-error/5 text-error border-error/20'
                          : result.status === 'pending'
                          ? 'bg-slate-50 text-slate-500 border-slate-200 italic'
                          : 'bg-slate-50 text-slate-800 border-slate-200'
                      }`}>
                        {result.status === 'error' ? (
                          <div>
                            <div className="font-medium mb-1">Request Failed</div>
                            <div className="text-error/80">{result.error}</div>
                          </div>
                        ) : result.status === 'pending' ? (
                          'Waiting for AI response...'
                        ) : (
                          result.response
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
