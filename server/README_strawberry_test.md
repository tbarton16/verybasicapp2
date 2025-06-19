# Multi-Model Strawberry Counting Test

This script tests multiple AI models' ability to count characters in words across different languages using the questions from `strawberry.md`.

## Supported Models

### OpenAI Models
- gpt-4.1-nano-2025-04-14
- o3-2025-04-16
- gpt-4.1-2025-04-14
- gpt-4o-2024-11-20

### Anthropic Models
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022

### Google Models
- gemini-1.5-pro-002
- gemini-1.5-flash-002

### DeepSeek Models
- deepseek-v3
- deepseek-reasoner

### Meta Models (via Together AI)
- meta-llama/Llama-3.3-70B-Instruct-Turbo
- meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up API keys (set only the ones you have access to):**
   ```bash
   export OPENAI_API_KEY='your-openai-key'
   export ANTHROPIC_API_KEY='your-anthropic-key'
   export GOOGLE_API_KEY='your-google-key'
   export TOGETHER_API_KEY='your-together-key'
   export DEEPSEEK_API_KEY='your-deepseek-key'
   ```

## Usage

```bash
python test_strawberry_counting.py
```

The script will automatically detect which API keys are available and test only the corresponding models.

## What it does

1. **Parses** the `strawberry.md` file to extract questions and expected answers
2. **Queries** each available model with questions (without showing the expected answer)
3. **Compares** each model's response to the expected answer
4. **Reports** comparative accuracy across all models and saves detailed results

## Output

The script will:
- Show real-time progress for each model and question
- Display a comparative summary with model rankings
- Save detailed results to multiple formats (JSON, CSV)
- Analyze language difficulty across all models

## Example Output

```
🔧 Checking API keys...
✅ Found API keys for: OpenAI, Anthropic (Claude), Google (Gemini)

🍓 Starting Multi-Model Strawberry Counting Test...
================================================================================

🤖 Testing Model: gpt-4.1-nano-2025-04-14
================================================================================

[1/33] gpt-4.1-nano-2025-04-14 - English...
Question: How many 'r' in "strawberry"?
Expected: 3
gpt-4.1-nano-2025-04-14 Response: '3' → 3
Result: ✅ CORRECT

...

📊 MULTI-MODEL COMPARATIVE SUMMARY
================================================================================
Model                          Accuracy   Correct  Wrong    Status    
--------------------------------------------------------------------------------
claude-3-5-sonnet-20241022    91.0%      30       3        ✅ OK      
gpt-4.1-2025-04-14            87.9%      29       4        ✅ OK      
gemini-1.5-pro-002            84.8%      28       5        ✅ OK      
deepseek-v3                   81.8%      27       6        ✅ OK      

🏆 MODEL RANKINGS:
🥇 claude-3-5-sonnet-20241022: 91.0%
🥈 gpt-4.1-2025-04-14: 87.9%
🥉 gemini-1.5-pro-002: 84.8%

📈 LANGUAGE DIFFICULTY ANALYSIS:
Most Challenging Languages (lowest accuracy):
 1. Chinese (Mandarin) 45.5% (5/11)
 2. Arabic           58.3% (7/12)
 3. Thai            66.7% (8/12)
```

## Output Files

- `multi_model_strawberry_results.json` - Complete comparative analysis
- `model_performance_summary.csv` - Easy-to-read performance table
- `detailed_results.csv` - Question-by-question breakdown
- Individual JSON files for each model

## Notes

- Automatically detects available API providers
- Includes smart handling for different model architectures (o1, Claude, etc.)
- Supports multilingual number extraction (Arabic numerals, Chinese numbers, etc.)
- Includes rate limiting and error handling for all providers
- Results include comprehensive language difficulty analysis 