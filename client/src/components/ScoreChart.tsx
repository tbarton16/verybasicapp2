import { Card, CardContent } from "@/components/ui/card";

interface ScoreChartProps {
  score1: number;
  score2: number;
}

export function ScoreChart({ score1, score2 }: ScoreChartProps) {
  console.log('ScoreChart received scores:', { score1, score2 });
  
  const maxScore = Math.max(score1, score2, 1); // Ensure we don't divide by zero
  const height = 200; // Chart height in pixels
  const barWidth = 60; // Width of each bar in pixels
  const gap = 20; // Gap between bars in pixels

  return (
    <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">Running Scores</h3>
        <div className="relative h-[200px] flex items-end justify-center space-x-4">
          {/* Score 1 Bar */}
          <div className="flex flex-col items-center">
            <div 
              className="w-[60px] rounded-t-md transition-all duration-300"
              style={{ 
                height: `${(score1 / maxScore) * height}px`,
                backgroundColor: 'rgb(59, 130, 246)', // blue-500
                minHeight: '4px' // Ensure bar is visible even when score is very small
              }}
            />
            <span className="mt-2 text-sm font-medium">Best of 1</span>
            <span className="text-xs text-slate-500">{score1.toFixed(2)}</span>
          </div>

          {/* Score 2 Bar */}
          <div className="flex flex-col items-center">
            <div 
              className="w-[60px] rounded-t-md transition-all duration-300"
              style={{ 
                height: `${(score2 / maxScore) * height}px`,
                backgroundColor: 'rgb(16, 185, 129)', // emerald-500
                minHeight: '4px' // Ensure bar is visible even when score is very small
              }}
            />
            <span className="mt-2 text-sm font-medium">Best of 10</span>
            <span className="text-xs text-slate-500">{score2.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
} 