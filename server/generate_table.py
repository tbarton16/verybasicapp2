#!/usr/bin/env python3
import csv
from collections import defaultdict

def generate_html_table():
    # Read the CSV file
    data = []
    with open('detailed_results.csv', 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            data.append(row)
    
    # Get unique models and languages
    models = list(dict.fromkeys([row['Model'] for row in data]))
    languages = list(dict.fromkeys([row['Language'] for row in data]))
    
    # Create a dictionary for quick lookup
    results = {}
    for row in data:
        key = (row['Model'], row['Language'])
        results[key] = row['Correct'] == 'True'
    
    # Generate HTML
    html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Model Performance by Language</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 100%;
            overflow-x: auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 11px;
        }
        th, td {
            padding: 6px;
            text-align: center;
            border: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 10;
            font-size: 10px;
        }
        .model-name {
            text-align: left;
            font-weight: bold;
            background-color: #f8f9fa;
            position: sticky;
            left: 0;
            z-index: 5;
            max-width: 250px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
        }
        .result-cell {
            width: 25px;
            height: 25px;
            position: relative;
        }
        .result-square {
            width: 16px;
            height: 16px;
            margin: 4px auto;
            border-radius: 2px;
            border: 1px solid #ccc;
        }
        .correct {
            background-color: #28a745;
        }
        .incorrect {
            background-color: #dc3545;
        }
        .legend {
            margin: 20px 0;
            display: flex;
            justify-content: center;
            gap: 30px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .legend-square {
            width: 16px;
            height: 16px;
            border-radius: 2px;
            border: 1px solid #ccc;
        }
        .summary {
            margin: 20px 0;
            text-align: center;
            color: #666;
        }
        th.lang-header {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            min-width: 25px;
            max-width: 25px;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>AI Model Performance by Language</h1>
        
        <div class="legend">
            <div class="legend-item">
                <div class="legend-square correct"></div>
                <span>Correct Answer</span>
            </div>
            <div class="legend-item">
                <div class="legend-square incorrect"></div>
                <span>Incorrect Answer</span>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th class="model-name">Model</th>'''
    
    # Add language headers
    for lang in languages:
        html += f'\n                    <th class="lang-header">{lang}</th>'
    
    html += '''
                </tr>
            </thead>
            <tbody>'''
    
    # Add model rows
    for model in models:
        html += f'\n                <tr>\n                    <td class="model-name" title="{model}">{model}</td>'
        
        for lang in languages:
            key = (model, lang)
            if key in results:
                is_correct = results[key]
                square_class = 'correct' if is_correct else 'incorrect'
                html += f'\n                    <td class="result-cell"><div class="result-square {square_class}"></div></td>'
            else:
                html += f'\n                    <td class="result-cell"><div class="result-square" style="background-color: #f0f0f0;"></div></td>'
        
        html += '\n                </tr>'
    
    html += '''
            </tbody>
        </table>

        <div class="summary">
            <p>This table shows AI model performance on letter counting tasks across ''' + str(len(languages)) + ''' languages.</p>
            <p>Green squares indicate correct answers, red squares indicate incorrect answers.</p>
            <p>Total models tested: ''' + str(len(models)) + '''</p>
        </div>
    </div>
</body>
</html>'''
    
    # Write the HTML file
    with open('results_table.html', 'w', encoding='utf-8') as file:
        file.write(html)
    
    print(f"Generated HTML table with {len(models)} models and {len(languages)} languages")
    print("File saved as: results_table.html")

if __name__ == "__main__":
    generate_html_table() 