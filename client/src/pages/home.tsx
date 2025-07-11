import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { type ExecutionResult, type Model, type PromptFile, AVAILABLE_MODELS } from "@shared/schema";
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
  Loader2,
  Trophy
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreChart } from "@/components/ScoreChart";
import { useLocation } from "wouter";

// Mapping for readable prompt file names
const PROMPT_FILE_NAMES: Record<string, string> = {
  'gsm8k_chinese': '🇨🇳 GSM8K - 中文 (Chinese)',
  'gsm8k_arabic': '🇸🇦 GSM8K - العربية (Arabic)',
  'gsm8k_indic_bn': '🇧🇩 GSM8K - বাংলা (Bengali)',
  'gsm8k_indic_bn_roman': '🇧🇩 GSM8K - Bengali (Romanized)',
  'gsm8k_indic_en': '🇺🇸 GSM8K - English',
  'gsm8k_indic_gu': '🇮🇳 GSM8K - ગુજરાતી (Gujarati)',
  'gsm8k_indic_gu_roman': '🇮🇳 GSM8K - Gujarati (Romanized)',
  'gsm8k_indic_hi': '🇮🇳 GSM8K - हिन्दी (Hindi)',
  'gsm8k_indic_hi_roman': '🇮🇳 GSM8K - Hindi (Romanized)',
  'gsm8k_indic_kn': '🇮🇳 GSM8K - ಕನ್ನಡ (Kannada)',
  'gsm8k_indic_kn_roman': '🇮🇳 GSM8K - Kannada (Romanized)',
  'gsm8k_indic_ml': '🇮🇳 GSM8K - മലയാളം (Malayalam)',
  'gsm8k_indic_ml_roman': '🇮🇳 GSM8K - Malayalam (Romanized)',
  'gsm8k_indic_mr': '🇮🇳 GSM8K - मराठी (Marathi)',
  'gsm8k_indic_mr_roman': '🇮🇳 GSM8K - Marathi (Romanized)',
  'gsm8k_indic_or': '🇮🇳 GSM8K - ଓଡ଼ିଆ (Odia)',
  'gsm8k_indic_or_roman': '🇮🇳 GSM8K - Odia (Romanized)',
  'gsm8k_indic_pa': '🇮🇳 GSM8K - ਪੰਜਾਬੀ (Punjabi)',
  'gsm8k_indic_pa_roman': '🇮🇳 GSM8K - Punjabi (Romanized)',
  'gsm8k_indic_ta': '🇮🇳 GSM8K - தமிழ் (Tamil)',
  'gsm8k_indic_ta_roman': '🇮🇳 GSM8K - Tamil (Romanized)',
  'gsm8k_indic_te': '🇮🇳 GSM8K - తెలుగు (Telugu)',
  'gsm8k_indic_te_roman': '🇮🇳 GSM8K - Telugu (Romanized)',
};

// Helper function to get display name for a prompt file
const getPromptFileDisplayName = (file: PromptFile): string => {
  return PROMPT_FILE_NAMES[file] || file;
};

// Categorize models into base and instruction-tuned
const BASE_MODELS = AVAILABLE_MODELS.filter(model => 
  !model.includes('-it') && !model.includes('gpt-4.5-preview') && !model.includes('gpt-4.1-2025')
   && !model.includes('gpt-nano') && !model.includes('sarvam-m') && !model.includes('qwen-2.5-7b') &&
    !model.includes('llama-4-maverick')&& !model.includes('gemma-3-12b') 
);
const INSTRUCTION_TUNED_MODELS = AVAILABLE_MODELS.filter(model => 
  model.includes('-it') || model.includes('gpt-4.5-preview') || !model.includes('deepseek-coder-v2-base') ||
   model.includes('gpt-nano') || model.includes('sarvam-m') || model.includes('qwen-2.5-7b') ||
    model.includes('llama-4-maverick') || model.includes('gemma-3-12b') || !model.includes('mistral-nemo') 
);

export default function Home() {
  const [sessionId] = useState(() => "demo-session-main");
  const [selectedModel, setSelectedModel] = useState<Model>("gpt-nano");
  const [selectedPromptFile, setSelectedPromptFile] = useState<PromptFile>("");
  const [selectedShots, setSelectedShots] = useState<number>(0);
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  // Fetch available prompt files
  const { data: promptFiles = { files: [] } } = useQuery<{ files: PromptFile[] }>({
    queryKey: ['/api/prompt-files'],
    staleTime: 30000, // Cache for 30 seconds
  });

  // Set initial prompt file when available
  useEffect(() => {
    if (promptFiles.files.length > 0 && !selectedPromptFile) {
      setSelectedPromptFile(promptFiles.files[0]);
    }
  }, [promptFiles.files, selectedPromptFile]);

  // Status polling query
  const { data: executionStatus, isLoading: statusLoading, error: statusError } = useQuery<{
    isRunning: boolean;
    currentPrompt: number;
    totalPrompts: number;
    error: string | null;
    completed: boolean;
    runningScore1: number;
    runningScore2: number;
  }>({
    queryKey: [`/api/execution-status/${sessionId}`],
    refetchInterval: 1000, // Poll every second
    enabled: true,
    retry: 3,
    retryDelay: 1000,
  });

  // Handle errors
  useEffect(() => {
    if (statusError) {
      console.error('Error fetching status:', statusError);
      toast({
        title: "Error fetching status",
        description: statusError instanceof Error ? statusError.message : "Failed to fetch status",
        variant: "destructive",
      });
    }
  }, [statusError, toast]);

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

  // Update the prompts count query to include the selected prompt file
  const { data: promptsCount } = useQuery<{ count: number }>({
    queryKey: ['/api/prompts/count', selectedPromptFile],
    enabled: !!selectedPromptFile,
    staleTime: 30000,
  });

  const { data: results = [], isLoading: resultsLoading, error: resultsError } = useQuery<ExecutionResult[]>({
    queryKey: [`/api/execution-results/${sessionId}`],
    staleTime: 0,
    refetchInterval: 1000, // Always poll for results
    retry: 3, // Retry failed requests 3 times
    retryDelay: 1000, // Wait 1 second between retries
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/start-execution', { 
      sessionId,
      model: selectedModel,
      promptFile: selectedPromptFile,
      shots: selectedShots
    }),
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

  // Handle errors
  useEffect(() => {
    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      toast({
        title: "Error fetching results",
        description: resultsError instanceof Error ? resultsError.message : "Failed to fetch results",
        variant: "destructive",
      });
    }
  }, [resultsError, toast]);

  // Add debug logging
  console.log('Execution Status:', executionStatus);
  console.log('Results:', results);

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
              <h1 className="text-xl font-semibold text-slate-900">Headroom Calculator</h1>
            </div>
            <div className="flex items-center space-x-4">
              <nav className="flex items-center space-x-1">
                <Button
                  variant={location === "/" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setLocation("/")}
                  className="flex items-center space-x-2"
                >
                  <Terminal className="w-4 h-4" />
                  <span>Execution</span>
                </Button>
                <Button
                  variant={location === "/leaderboard" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setLocation("/leaderboard")}
                  className="flex items-center space-x-2"
                >
                  <Trophy className="w-4 h-4" />
                  <span>Leaderboard</span>
                </Button>
              </nav>
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
                  Choose a model and an evaluation benchmark to run.
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Total Prompts</div>
                <div className="text-2xl font-bold text-slate-900">
                  {promptsCount?.count || 1321}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 mb-4">
              <div className="flex items-center space-x-4">
                <Select
                  value={selectedModel}
                  onValueChange={(value: Model) => setSelectedModel(value)}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_MODELS.map((model) => (
                      <SelectItem key={model} value={model}>
                        <div className="flex items-center justify-between w-full">
                          <span>{model}</span>
                          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 border-green-200">
                            base model
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                    {BASE_MODELS.length > 0 && INSTRUCTION_TUNED_MODELS.length > 0 && (
                      <div className="border-t border-slate-200 my-1"></div>
                    )}
                    {INSTRUCTION_TUNED_MODELS.map((model) => (
                      <SelectItem key={model} value={model}>
                        <div className="flex items-center justify-between w-full">
                          <span>{model}</span>
                          <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800 border-yellow-200">
                            finetuned
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedPromptFile}
                  onValueChange={(value: PromptFile) => setSelectedPromptFile(value)}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select benchmark" />
                  </SelectTrigger>
                  <SelectContent>
                    {promptFiles.files.map((file) => (
                      <SelectItem key={file} value={file}>
                        {getPromptFileDisplayName(file)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedShots.toString()}
                  onValueChange={(value: string) => setSelectedShots(parseInt(value))}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Shots" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 9 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i} shot{i !== 1 ? 's' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleStart}
                  disabled={isRunning || startMutation.isPending || !selectedPromptFile}
                  className="bg-primary hover:bg-blue-700 text-white px-6 py-3 shadow-sm hover:shadow-md"
                >
                  {startMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {isRunning ? 'Running...' : 'Start Execution'}
                </Button>

              </div>

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

          {/* Debug section 
          <div className="bg-slate-100 p-4 rounded-lg mb-4">
            <h3 className="font-medium mb-2">Debug Information:</h3>
            <pre className="text-sm">
              {JSON.stringify({
                hasExecutionStatus: !!executionStatus,
                isRunning: executionStatus?.isRunning,
                currentPrompt: executionStatus?.currentPrompt,
                totalPrompts: executionStatus?.totalPrompts,
                score1: executionStatus?.runningScore1,
                score2: executionStatus?.runningScore2
              }, null, 2)}
            </pre>
          </div>
          */}
          {/* Score Chart */}
          {executionStatus ? (
            <div className="border border-slate-200 rounded-lg p-4 mb-4">
              <ScoreChart 
                score1={executionStatus.runningScore1 || 0} 
                score2={executionStatus.runningScore2 || 0} 
              />
            </div>
          ) : (
            <div className="text-slate-500 text-center p-4">
              Waiting for execution status...
            </div>
          )}

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
                        ) : result.response ? (
                          <div>
                            {(() => {
                              const parts = result.response.split(/(\d+(?:[,.]\d+)?)/);
                              const numbers = result.response.match(/\d+(?:[,.]\d+)?/g) || [];
                              const lastNumber = numbers[numbers.length - 1];
                              
                              return parts.map((part, index) => {
                                if (part === lastNumber) {
                                  return <span key={index} className="bg-yellow-200 text-yellow-900 px-1 rounded font-bold">{part}</span>;
                                }
                                return part;
                              });
                            })()}
                          </div>
                        ) : (
                          'No response'
                        )}
                      </div>
                    </div>

                    {/* Extracted Answer - Only show when status is success */}
                    {result.status === 'success' && result.extractedAnswer && (
                      <div className="mt-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <Bot className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-slate-700">AI Extracted Answer</span>
                        </div>
                        <div className="rounded-lg p-4 font-mono text-sm bg-primary/5 text-primary border border-primary/20">
                          {result.extractedAnswer}
                        </div>
                      </div>
                    )}

                    {/* Expected Answer - Only show when status is success */}
                    {result.status === 'success' && result.answer && (
                      <div className="mt-4">
                        <div className="flex items-center space-x-2 mb-2">
                          {result.score === 1 ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm font-medium text-slate-700">Expected Answer</span>
                          {result.score !== undefined && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              result.score === 1 
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              Score: {result.score}
                            </span>
                          )}
                        </div>
                        <div className={`rounded-lg p-4 font-mono text-sm border ${
                          result.score === 1 
                            ? 'bg-green-50 text-green-800 border-green-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}>
                          {result.answer}
                        </div>
                      </div>
                    )}
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
