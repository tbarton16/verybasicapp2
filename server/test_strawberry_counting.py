#!/usr/bin/env python3
"""
Test script to evaluate GPT-4's counting abilities across different languages.
Reads questions from strawberry.md and compares GPT-4 responses to expected answers.
"""

import re
import os
import json
import time
from typing import List, Tuple, Dict
from openai import OpenAI
import anthropic
import google.generativeai as genai
from together import Together
import requests

class StrawberryCountingTest:
    def __init__(self, openai_key: str = None, anthropic_key: str = None, google_key: str = None, 
                 together_key: str = None, deepseek_key: str = None):
        """Initialize the test with API keys for different providers."""
        
        # Initialize API clients
        self.clients = {}
        
        # OpenAI client
        openai_key = openai_key or os.getenv('OPENAI_API_KEY')
        if openai_key:
            self.clients['openai'] = OpenAI(api_key=openai_key)
        
        # Anthropic client
        anthropic_key = anthropic_key or os.getenv('ANTHROPIC_API_KEY')
        if anthropic_key:
            self.clients['anthropic'] = anthropic.Anthropic(api_key=anthropic_key)
        
        # Google client
        google_key = google_key or os.getenv('GOOGLE_API_KEY')
        if google_key:
            genai.configure(api_key=google_key)
            self.clients['google'] = genai
        
        # Together client (for Llama)
        together_key = together_key or os.getenv('TOGETHER_API_KEY')
        if together_key:
            self.clients['together'] = Together(api_key=together_key)
        
        # DeepSeek API key
        deepseek_key = together_key
        if deepseek_key:
            self.clients['deepseek'] = Together(api_key=together_key)  # Store key for HTTP requests
        
        # Define the models to test
        self.models_to_test = [
            # OpenAI models
            "gpt-4.1-nano-2025-04-14", 
            # "o3-2025-04-16",  # Requires organization verification
            "gpt-4.1-2025-04-14",
            "gpt-4o-2024-11-20",
            # Anthropic models
            "claude-3-7-sonnet-20250219",
            "claude-sonnet-4-20250514",
            # Google models
            "gemini-2.5-flash-preview-05-20",
            "gemini-2.5-pro-preview-06-05",
            "gemma-3n-e4b-it",
            # DeepSeek models
            "deepseek-ai/DeepSeek-V3",
            # Meta models (via Together)
            "meta-llama/Llama-4-Scout-17B-16E-Instruct",
            "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8"
        ]
        
        self.all_model_results = {}
        self.questions = []
    
    def test_model_connection(self, model: str) -> Dict:
        """Test connection to a specific model with a simple query."""
        test_question = "How many letters are in 'test'?"
        expected_answer = 4
        
        print(f"Testing {model}...", end=" ")
        
        try:
            start_time = time.time()
            response = self.query_model(test_question, model)
            end_time = time.time()
            
            # Extract number from response
            extracted_number = self.extract_number_from_response(response)
            
            # Determine status
            if response.startswith("ERROR"):
                status = "❌ ERROR"
                details = response
            elif extracted_number == expected_answer:
                status = "✅ WORKING"
                details = f"Correct answer ({extracted_number})"
            elif extracted_number == -1:
                status = "⚠️  UNCLEAR"
                details = f"Unclear response: '{response}'"
            else:
                status = "⚠️  WRONG"
                details = f"Wrong answer: got {extracted_number}, expected {expected_answer}"
            
            response_time = round((end_time - start_time) * 1000)  # ms
            
            print(f"{status} ({response_time}ms)")
            
            return {
                'model': model,
                'status': status,
                'response': response,
                'extracted_number': extracted_number,
                'expected': expected_answer,
                'response_time_ms': response_time,
                'details': details
            }
            
        except Exception as e:
            print(f"❌ ERROR")
            return {
                'model': model,
                'status': '❌ ERROR',
                'response': f'Exception: {str(e)}',
                'extracted_number': -1,
                'expected': expected_answer,
                'response_time_ms': -1,
                'details': f'Exception: {str(e)}'
            }
    
    def run_connection_test(self) -> Dict:
        """Test connections to all available models."""
        print("🔌 TESTING MODEL CONNECTIONS")
        print("=" * 80)
        print("Testing each model with: 'How many letters are in 'test'?' (expected: 4)")
        print("-" * 80)
        
        results = []
        working_models = []
        error_models = []
        
        for model in self.models_to_test:
            provider, _ = self.get_provider_and_model(model)
            
            # Skip if provider client not available
            if provider not in self.clients:
                print(f"Testing {model}... ⏭️  SKIPPED (no {provider} API key)")
                results.append({
                    'model': model,
                    'status': '⏭️  SKIPPED',
                    'response': f'No {provider} API key',
                    'extracted_number': -1,
                    'expected': 4,
                    'response_time_ms': -1,
                    'details': f'No {provider} API key provided'
                })
                continue
            
            result = self.test_model_connection(model)
            results.append(result)
            
            if result['status'] == '✅ WORKING':
                working_models.append(model)
            elif result['status'].startswith('❌'):
                error_models.append(model)
            
            # Small delay between tests
            time.sleep(0.5)
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 CONNECTION TEST SUMMARY")
        print("=" * 80)
        
        working_count = len(working_models)
        error_count = len(error_models)
        skipped_count = len([r for r in results if r['status'] == '⏭️  SKIPPED'])
        
        print(f"✅ Working Models: {working_count}")
        print(f"❌ Error Models: {error_count}")
        print(f"⏭️  Skipped Models: {skipped_count}")
        print(f"📊 Total Models: {len(results)}")
        
        if working_models:
            print(f"\n✅ WORKING MODELS ({len(working_models)}):")
            for model in working_models:
                result = next(r for r in results if r['model'] == model)
                print(f"  • {model} ({result['response_time_ms']}ms)")
        
        if error_models:
            print(f"\n❌ ERROR MODELS ({len(error_models)}):")
            for model in error_models:
                result = next(r for r in results if r['model'] == model)
                print(f"  • {model}: {result['details']}")
        
        # Save results
        summary = {
            'test_type': 'connection_test',
            'test_question': 'How many letters are in \'test\'?',
            'expected_answer': 4,
            'total_models': len(results),
            'working_models': working_count,
            'error_models': error_count,
            'skipped_models': skipped_count,
            'results': results
        }
        
        with open('connection_test_results.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Results saved to connection_test_results.json")
        
        return summary
    
    def parse_strawberry_file(self, filepath: str) -> List[Tuple[str, str, int]]:
        """
        Parse the strawberry.md file to extract questions and expected answers.
        Returns list of tuples: (language, question, expected_answer)
        """
        questions = []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Pattern to match each line: Language – Question? → Answer
        pattern = r'^\d+\.\s*\*\*(.*?)\*\*\s*–\s*(.*?)\s*→\s*\*\*(\d+)\*\*'
        
        for line in content.split('\n'):
            line = line.strip()
            if not line:
                continue
                
            match = re.match(pattern, line)
            if match:
                language = match.group(1)
                question = match.group(2)
                expected_answer = int(match.group(3))
                questions.append((language, question, expected_answer))
        
        return questions
    
    def get_provider_and_model(self, model_name: str) -> Tuple[str, str]:
        """Determine the provider and clean model name."""
        if model_name.startswith(("gpt-", "o1", "o3")):
            return "openai", model_name
        elif model_name.startswith("claude"):
            return "anthropic", model_name
        elif model_name.startswith("gemini"):
            return "google", model_name
        elif model_name.startswith("deepseek"):
            return "deepseek", model_name
        elif model_name.startswith("meta-llama"):
            return "together", model_name
        else:
            return "unknown", model_name

    def query_model(self, question: str, model: str) -> str:
        """Query specific model with a counting question across different providers."""
        provider, model_name = self.get_provider_and_model(model)
        
        if provider not in self.clients:
            return f"ERROR: {provider} client not initialized"
        
        try:
            if provider == "openai":
                return self._query_openai(question, model_name)
            elif provider == "anthropic":
                return self._query_anthropic(question, model_name)
            elif provider == "google":
                return self._query_google(question, model_name)
            elif provider == "deepseek":
                return self._query_deepseek(question, model_name)
            elif provider == "together":
                return self._query_together(question, model_name)
            else:
                return f"ERROR: Unknown provider {provider}"
                
        except Exception as e:
            print(f"Error querying {model}: {e}")
            return "ERROR"
    
    def _query_openai(self, question: str, model: str) -> str:
        """Query OpenAI models."""
        client = self.clients['openai']
        
        # Adjust parameters for reasoning models (o1 series)
        if model.startswith("o1"):
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user", 
                        "content": f"Answer this counting question with only the numerical answer: {question}"
                    }
                ],
                max_completion_tokens=50
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a helpful assistant that answers counting questions accurately. Provide only the numerical answer, nothing else."
                    },
                    {
                        "role": "user", 
                        "content": question
                    }
                ],
                max_tokens=10,
                temperature=0
            )
        return response.choices[0].message.content.strip()
    
    def _query_anthropic(self, question: str, model: str) -> str:
        """Query Anthropic Claude models."""
        client = self.clients['anthropic']
        
        response = client.messages.create(
            model=model,
            max_tokens=10,
            temperature=0,
            system="You are a helpful assistant that answers counting questions accurately. Provide only the numerical answer, nothing else.",
            messages=[
                {
                    "role": "user",
                    "content": question
                }
            ]
        )
        return response.content[0].text.strip()
    
    def _query_google(self, question: str, model: str) -> str:
        """Query Google Gemini models."""
        model_instance = genai.GenerativeModel(model)
        
        prompt = f"Answer this counting question with only the numerical answer, nothing else: {question}"
        response = model_instance.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=10,
                temperature=0
            )
        )
        return response.text.strip()
    
    def _query_deepseek(self, question: str, model: str) -> str:
        """Query DeepSeek models via Together API."""
        client = self.clients['deepseek']  # This is now a Together client
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that answers counting questions accurately. Provide only the numerical answer, nothing else."
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            max_tokens=10,
            temperature=0
        )
        return response.choices[0].message.content.strip()
    
    def _query_together(self, question: str, model: str) -> str:
        """Query Together AI models (Llama)."""
        client = self.clients['together']
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that answers counting questions accurately. Provide only the numerical answer, nothing else."
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            max_tokens=10,
            temperature=0
        )
        return response.choices[0].message.content.strip()
    
    def extract_number_from_response(self, response: str) -> int:
        """Extract the first number from GPT's response, handling Unicode digits from different languages."""
        if response == "ERROR":
            return -1
        
        # Dictionary to convert various numeral systems to Arabic numerals
        numeral_map = {
            # Arabic-Indic digits
            '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
            # Persian digits
            '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
            # Hindi/Devanagari digits
            '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
            # Bengali digits
            '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
            # Thai digits
            '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
            # Chinese numerals (common ones)
            '零': '0', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
            '〇': '0', '壹': '1', '贰': '2', '叁': '3', '肆': '4', '伍': '5', '陆': '6', '柒': '7', '捌': '8', '玖': '9',
            # Myanmar digits
            '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4', '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9',
            # Khmer digits
            '០': '0', '១': '1', '២': '2', '៣': '3', '៤': '4', '៥': '5', '៦': '6', '៧': '7', '៨': '8', '៩': '9',
            # Tibetan digits
            '༠': '0', '༡': '1', '༢': '2', '༣': '3', '༤': '4', '༥': '5', '༦': '6', '༧': '7', '༨': '8', '༩': '9',
        }
        
        # Normalize the response by converting all numeral systems to ASCII digits
        normalized_response = response
        for foreign_digit, ascii_digit in numeral_map.items():
            normalized_response = normalized_response.replace(foreign_digit, ascii_digit)
        
        # Look for ASCII digits in the normalized response
        numbers = re.findall(r'\d+', normalized_response)
        if numbers:
            return int(numbers[0])
        
        # If no numbers found, try to find any digit-like characters manually
        # Scan through each character to find sequences of digits
        current_number = ""
        for char in response:
            if char in numeral_map:
                current_number += numeral_map[char]
            elif char.isdigit():
                current_number += char
            else:
                if current_number:
                    return int(current_number)
                current_number = ""
        
        # Check if we ended with a number
        if current_number:
            return int(current_number)
        
        return -1
    
    def run_single_model_test(self, model: str, questions: List[Tuple[str, str, int]]) -> Dict:
        """Run test for a single model."""
        print(f"\n🤖 Testing Model: {model}")
        print("=" * 80)
        
        results = []
        correct_count = 0
        
        for i, (language, question, expected) in enumerate(questions, 1):
            print(f"\n[{i}/{len(questions)}] {model} - {language}...")
            print(f"Question: {question}")
            
            # Query model
            model_response = self.query_model(question, model)
            model_answer = self.extract_number_from_response(model_response)
            
            # Check if correct
            is_correct = model_answer == expected
            status = "✅ CORRECT" if is_correct else "❌ WRONG"
            
            print(f"Expected: {expected}")
            print(f"{model} Response: '{model_response}' → {model_answer}")
            print(f"Result: {status}")
            
            # Record result
            result = {
                'language': language,
                'question': question,
                'expected': expected,
                'model_response': model_response,
                'model_answer': model_answer,
                'correct': is_correct
            }
            results.append(result)
            
            if is_correct:
                correct_count += 1
            
            # Small delay to respect API rate limits
            time.sleep(0.5)
        
        # Generate summary for this model
        accuracy = (correct_count / len(questions)) * 100 if questions else 0
        model_summary = {
            'model': model,
            'total_questions': len(questions),
            'correct_answers': correct_count,
            'wrong_answers': len(questions) - correct_count,
            'accuracy_percentage': round(accuracy, 2),
            'results': results
        }
        
        return model_summary

    def run_test(self, filepath: str) -> Dict:
        """Run the complete test suite across all models."""
        print("🍓 Starting Multi-Model Strawberry Counting Test...")
        print("=" * 80)
        
        # Parse questions once
        self.questions = self.parse_strawberry_file(filepath)
        print(f"Loaded {len(self.questions)} questions from {filepath}")
        print(f"Testing {len(self.models_to_test)} models...")
        
        # Test each model
        for model in self.models_to_test:
            try:
                model_results = self.run_single_model_test(model, self.questions)
                self.all_model_results[model] = model_results
            except Exception as e:
                print(f"❌ Error testing {model}: {e}")
                # Create error result
                self.all_model_results[model] = {
                    'model': model,
                    'total_questions': len(self.questions),
                    'correct_answers': 0,
                    'wrong_answers': len(self.questions),
                    'accuracy_percentage': 0.0,
                    'error': str(e),
                    'results': []
                }
        
        return self.generate_comparative_summary()
    
    def generate_comparative_summary(self) -> Dict:
        """Generate comparative summary across all models."""
        print("\n" + "=" * 80)
        print("📊 MULTI-MODEL COMPARATIVE SUMMARY")
        print("=" * 80)
        
        # Calculate overall statistics
        total_questions = len(self.questions)
        
        # Create summary table
        print(f"{'Model':<30} {'Accuracy':<10} {'Correct':<8} {'Wrong':<8} {'Status':<10}")
        print("-" * 80)
        
        model_rankings = []
        for model, results in self.all_model_results.items():
            accuracy = results['accuracy_percentage']
            correct = results['correct_answers'] 
            wrong = results['wrong_answers']
            status = "✅ OK" if 'error' not in results else "❌ ERROR"
            
            print(f"{model:<30} {accuracy:<10.1f}% {correct:<8} {wrong:<8} {status:<10}")
            
            if 'error' not in results:
                model_rankings.append((model, accuracy, results))
        
        # Sort by accuracy
        model_rankings.sort(key=lambda x: x[1], reverse=True)
        
        print("\n🏆 MODEL RANKINGS:")
        for i, (model, accuracy, _) in enumerate(model_rankings, 1):
            medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
            print(f"{medal} {model}: {accuracy:.1f}%")
        
        # Analyze by language difficulty
        print("\n📈 LANGUAGE DIFFICULTY ANALYSIS:")
        language_performance = {}
        
        for model, results in self.all_model_results.items():
            if 'error' in results:
                continue
            for result in results['results']:
                lang = result['language']
                if lang not in language_performance:
                    language_performance[lang] = {'correct': 0, 'total': 0}
                language_performance[lang]['total'] += 1
                if result['correct']:
                    language_performance[lang]['correct'] += 1
        
        # Sort languages by difficulty (lowest accuracy first)
        lang_difficulty = []
        for lang, stats in language_performance.items():
            accuracy = (stats['correct'] / stats['total']) * 100 if stats['total'] > 0 else 0
            lang_difficulty.append((lang, accuracy, stats['correct'], stats['total']))
        
        lang_difficulty.sort(key=lambda x: x[1])
        
        print("\nMost Challenging Languages (lowest accuracy):")
        for i, (lang, accuracy, correct, total) in enumerate(lang_difficulty[:10], 1):
            print(f"{i:2}. {lang:<15} {accuracy:5.1f}% ({correct}/{total})")
        
        # Generate comprehensive summary
        summary = {
            'test_overview': {
                'total_models_tested': len(self.all_model_results),
                'total_questions_per_model': total_questions,
                'successful_models': len([r for r in self.all_model_results.values() if 'error' not in r])
            },
            'model_results': self.all_model_results,
            'rankings': [(model, accuracy) for model, accuracy, _ in model_rankings],
            'language_difficulty': lang_difficulty
        }
        
        return summary
    
    def save_results(self, filename: str = "multi_model_strawberry_results.json"):
        """Save detailed results to JSON file."""
        summary = self.generate_comparative_summary()
        
        # Save comprehensive results
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Comprehensive results saved to {filename}")
        
        # Save individual model results
        for model, results in self.all_model_results.items():
            model_filename = f"results_{model.replace('/', '_').replace('-', '_')}.json"
            with open(model_filename, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"📁 Individual model results saved to separate files")
        
        # Generate and save CSV summary
        self.save_csv_summary()
    
    def save_csv_summary(self):
        """Save a CSV summary of model performance."""
        import csv
        
        # Model summary CSV
        with open('model_performance_summary.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Model', 'Accuracy_%', 'Correct_Answers', 'Wrong_Answers', 'Total_Questions', 'Status'])
            
            for model, results in self.all_model_results.items():
                status = "OK" if 'error' not in results else f"ERROR: {results.get('error', 'Unknown')}"
                writer.writerow([
                    model,
                    results['accuracy_percentage'],
                    results['correct_answers'],
                    results['wrong_answers'],
                    results['total_questions'],
                    status
                ])
        
        # Detailed results CSV
        with open('detailed_results.csv', 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Model', 'Language', 'Question', 'Expected', 'Got', 'Correct', 'Response'])
            
            for model, model_results in self.all_model_results.items():
                if 'results' in model_results:
                    for result in model_results['results']:
                        writer.writerow([
                            model,
                            result['language'],
                            result['question'],
                            result['expected'],
                            result['model_answer'],
                            result['correct'],
                            result['model_response']
                        ])
        
        print(f"📊 CSV summaries saved: model_performance_summary.csv, detailed_results.csv")

def main():
    """Main function to run the test."""
    import sys
    
    # Check for connection test flag
    if len(sys.argv) > 1 and sys.argv[1] == "--test-connections":
        print("🔧 Checking API keys...")
        
        # Check which API keys are available
        available_providers = []
        
        if os.getenv('OPENAI_API_KEY'):
            available_providers.append("OpenAI")
        if os.getenv('ANTHROPIC_API_KEY'):
            available_providers.append("Anthropic (Claude)")
        if os.getenv('GOOGLE_API_KEY'):
            available_providers.append("Google (Gemini)")
        if os.getenv('TOGETHER_API_KEY'):
            available_providers.append("Together (Llama + DeepSeek)")
        
        if not available_providers:
            print("❌ No API keys found! Please set at least one of:")
            print("   export OPENAI_API_KEY='your-openai-key'")
            print("   export ANTHROPIC_API_KEY='your-anthropic-key'")
            print("   export GOOGLE_API_KEY='your-google-key'")
            print("   export TOGETHER_API_KEY='your-together-key'")
            return
        
        print(f"✅ Found API keys for: {', '.join(available_providers)}")
        
        try:
            tester = StrawberryCountingTest()
            tester.run_connection_test()
        except Exception as e:
            print(f"❌ Error running connection test: {e}")
        
        return
    
    # Regular test mode
    print("🔧 Checking API keys...")
    
    # Check which API keys are available
    available_providers = []
    
    if os.getenv('OPENAI_API_KEY'):
        available_providers.append("OpenAI")
    if os.getenv('ANTHROPIC_API_KEY'):
        available_providers.append("Anthropic (Claude)")
    if os.getenv('GOOGLE_API_KEY'):
        available_providers.append("Google (Gemini)")
    if os.getenv('TOGETHER_API_KEY'):
        available_providers.append("Together (Llama + DeepSeek)")
    
    if not available_providers:
        print("❌ No API keys found! Please set at least one of:")
        print("   export OPENAI_API_KEY='your-openai-key'")
        print("   export ANTHROPIC_API_KEY='your-anthropic-key'")
        print("   export GOOGLE_API_KEY='your-google-key'")
        print("   export TOGETHER_API_KEY='your-together-key'")
        print("\n💡 Tip: Run with --test-connections to quickly test model access")
        return
    
    print(f"✅ Found API keys for: {', '.join(available_providers)}")
    print("💡 Tip: Run with --test-connections to quickly test model access first")
    
    try:
        tester = StrawberryCountingTest()
        results = tester.run_test('strawberry.md')
        tester.save_results()
        
    except Exception as e:
        print(f"❌ Error running test: {e}")

if __name__ == "__main__":
    main() 