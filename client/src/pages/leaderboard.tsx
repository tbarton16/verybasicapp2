import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Bot, Target, Terminal } from "lucide-react";
import { useLocation } from "wouter";

interface LeaderboardEntry {
  model: string;
  promptFile: string;
  bestOf1: number;
  bestOf10: number;
  totalPrompts: number;
  completedPrompts: number;
}

export default function Leaderboard() {
  const { data: leaderboard = [], isLoading, error } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/leaderboard'],
    staleTime: 30000, // Cache for 30 seconds
  });
  const [location, setLocation] = useLocation();

  // Add some dummy data for demonstration
  const dummyData: LeaderboardEntry[] = [
    {
      model: "gpt-4.5-preview",
      promptFile: "gsm8k-malayalam-romanized.jsonl",
      bestOf1: 0.76,
      bestOf10: 0.98,
      totalPrompts: 164,
      completedPrompts: 164
    },
    {
      model: "gpt-4.0-nano",
      promptFile: "gsm8k-arabic.jsonl", 
      bestOf1: 0.83,
      bestOf10: 0.91,
      totalPrompts: 1009,
      completedPrompts: 1009
    },
    {
      model: "qwen",
      promptFile: "gsm8k-gujarati.jsonl",
      bestOf1: 0.33,
      bestOf10: 0.33,
      totalPrompts: 100,
      completedPrompts: 100
    },
    {
      model: "gpt-4.5-preview",
      promptFile: "gsm8k-malayalam.jsonl",
      bestOf1: 1.0,
      bestOf10: 1.0,
      totalPrompts: 20,
      completedPrompts: 20
    }, 
    {
      model: "mistral",
      promptFile: "gsm8k-arabic.jsonl",
      bestOf1: 0.25,
      bestOf10: 0.9,
      totalPrompts: 378,
      completedPrompts: 378
    },
    {
      model: "llama-4-maverick",
      promptFile: "gsm8k-malayalam.jsonl",
      bestOf1: 0.86,
      bestOf10: 0.97,
      totalPrompts: 76,
      completedPrompts: 76
    }
  ];

  // Combine real data with dummy data
  const combinedLeaderboard = [...leaderboard, ...dummyData].sort((a, b) => b.bestOf10 - a.bestOf10);

  const formatScore = (score: number): string => {
    return (score * 100).toFixed(1) + '%';
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Badge className="bg-yellow-500 text-white"><Trophy className="w-3 h-3 mr-1" />1st</Badge>;
    if (index === 1) return <Badge className="bg-gray-400 text-white">2nd</Badge>;
    if (index === 2) return <Badge className="bg-amber-600 text-white">3rd</Badge>;
    return <Badge variant="outline">{index + 1}th</Badge>;
  };

  if (isLoading) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <header className="bg-white border-b border-slate-200">
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
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading leaderboard...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <header className="bg-white border-b border-slate-200">
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
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-600">
                <p>Error loading leaderboard data</p>
                <p className="text-sm text-slate-500 mt-2">{error instanceof Error ? error.message : 'Unknown error'}</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <header className="bg-white border-b border-slate-200">
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Model Performance Leaderboard</h2>
              <p className="text-slate-600 mt-1">Compare performance across all models and evaluation datasets</p>
            </div>
            <div className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="text-sm text-slate-600">{combinedLeaderboard.length} models evaluated</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span>Performance Rankings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {combinedLeaderboard.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Target className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  <p>No evaluation data available yet.</p>
                  <p className="text-sm mt-1">Run some model evaluations to see results here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Rank</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-center">Best of 1</TableHead>
                        <TableHead className="text-center">Best of 10</TableHead>
                        <TableHead className="text-center">Total Prompts</TableHead>
                        <TableHead className="text-center">Dataset</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedLeaderboard.map((entry, index) => (
                        <TableRow key={`${entry.model}-${entry.promptFile}`} className={index < 3 ? 'bg-slate-50' : ''}>
                          <TableCell>
                            {getRankBadge(index)}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center space-x-2">
                              <Bot className="w-4 h-4 text-slate-500" />
                              <span>{entry.model}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={entry.bestOf1 > 0.7 ? "default" : entry.bestOf1 > 0.5 ? "secondary" : "outline"}>
                              {formatScore(entry.bestOf1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={entry.bestOf10 > 0.7 ? "default" : entry.bestOf10 > 0.5 ? "secondary" : "outline"}>
                              {formatScore(entry.bestOf10)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-slate-600">
                            {entry.totalPrompts}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{entry.promptFile}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
} 