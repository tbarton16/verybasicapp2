#!/usr/bin/env python3
"""
Simple script to run the extended strawberry counting test and display per-language accuracy.

Usage Examples:
    python run_extended_test.py                    # Run in parallel mode (default)
    python run_extended_test.py --sequential       # Run sequentially (slower but more detailed output)
    python run_extended_test.py --workers 4        # Use 4 parallel workers
    python run_extended_test.py --help             # Show help

Parallel mode will test all models simultaneously, significantly reducing total execution time.
Sequential mode provides more detailed per-question output but takes much longer.
"""

import os
import sys
import json
import argparse
from test_strawberry_counting import StrawberryCountingTest

def print_language_accuracy_summary(language_report):
    """Print a clean summary of per-language accuracy."""
    print("\n" + "=" * 80)
    print("📊 PER-LANGUAGE ACCURACY SUMMARY")
    print("=" * 80)
    
    # Sort languages by average accuracy (ascending - hardest first)
    language_difficulties = language_report.get('language_difficulties', [])
    
    if not language_difficulties:
        print("❌ No language difficulty data available.")
        return
    
    print(f"{'Language':<20} {'Avg Accuracy':<12} {'Questions':<10} {'Difficulty':<15}")
    print("-" * 70)
    
    for language, avg_accuracy, questions in language_difficulties:
        if avg_accuracy < 30:
            difficulty = "🔴 Very Hard"
        elif avg_accuracy < 50:
            difficulty = "🟠 Hard"
        elif avg_accuracy < 70:
            difficulty = "🟡 Medium"
        else:
            difficulty = "🟢 Easy"
        
        print(f"{language:<20} {avg_accuracy:>8.1f}%      {questions:<10} {difficulty:<15}")
    
    # Show top and bottom 5 languages
    print(f"\n🏆 EASIEST LANGUAGES (Top 5):")
    top_5 = sorted(language_difficulties, key=lambda x: x[1], reverse=True)[:5]
    for i, (lang, acc, q) in enumerate(top_5, 1):
        print(f"{i}. {lang}: {acc:.1f}% accuracy")
    
    print(f"\n🔥 HARDEST LANGUAGES (Bottom 5):")
    bottom_5 = sorted(language_difficulties, key=lambda x: x[1])[:5]
    for i, (lang, acc, q) in enumerate(bottom_5, 1):
        print(f"{i}. {lang}: {acc:.1f}% accuracy")

def main():
    """Run the extended test and display results."""
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Run extended strawberry counting test")
    parser.add_argument("--parallel", action="store_true", default=True, 
                       help="Run tests in parallel (default: True)")
    parser.add_argument("--sequential", action="store_true", 
                       help="Run tests sequentially (overrides --parallel)")
    parser.add_argument("--workers", type=int, default=None,
                       help="Number of parallel workers (default: auto)")
    args = parser.parse_args()
    
    # Check if extended file exists
    if not os.path.exists("strawberry-extended.md"):
        print("❌ File not found: strawberry-extended.md")
        print("Please ensure the extended dataset file exists in the current directory.")
        return
    
    # Determine execution mode
    use_parallel = args.parallel and not args.sequential
    
    if use_parallel:
        print("🍓 Starting Extended Strawberry Counting Test (PARALLEL MODE)")
        if args.workers:
            print(f"⚙️  Using {args.workers} parallel workers")
    else:
        print("🍓 Starting Extended Strawberry Counting Test (SEQUENTIAL MODE)")
    
    print("📖 Using dataset: strawberry-extended.md")
    
    # Initialize tester
    tester = StrawberryCountingTest()
    
    try:
        # Run the main test
        if use_parallel:
            print("\n🚀 Testing models in parallel...")
            summary = tester.run_test_parallel("strawberry-extended.md", max_workers=args.workers)
        else:
            print("\n🤖 Testing models sequentially...")
            summary = tester.run_test("strawberry-extended.md")
        
        # Generate per-language report
        print("\n📊 Generating per-language accuracy report...")
        language_report = tester.generate_per_language_report()
        
        # Print clean summary
        print_language_accuracy_summary(language_report)
        
        # Save results
        tester.save_results("extended_test_results.json")
        
        # Save language report
        with open('extended_language_report.json', 'w', encoding='utf-8') as f:
            json.dump(language_report, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Extended test completed successfully!")
        print("📁 Generated files:")
        print("   • extended_test_results.json - Complete test results")
        print("   • extended_language_report.json - Per-language accuracy stats")
        print("   • model_performance_summary.csv - Model comparison")
        print("   • detailed_results.csv - All questions and answers")
        
        # Quick stats
        total_models = len([r for r in tester.all_model_results.values() if 'error' not in r])
        total_languages = len(language_report.get('language_difficulties', []))
        total_questions = len(tester.questions)
        
        print(f"\n📈 Quick Stats:")
        print(f"   • {total_models} models tested")
        print(f"   • {total_languages} languages covered")
        print(f"   • {total_questions} total questions")
        
        execution_mode = "parallel" if use_parallel else "sequential"
        print(f"   • Execution mode: {execution_mode}")
        
    except FileNotFoundError:
        print("❌ Error: Could not find strawberry-extended.md")
        print("Please make sure the file exists in the current directory.")
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        print("Please check your API keys and network connection.")

if __name__ == "__main__":
    main() 