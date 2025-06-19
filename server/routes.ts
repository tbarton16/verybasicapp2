import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExecutionResultSchema, type ExecutionResult, type Model, type PromptFile, AVAILABLE_MODELS, getAvailablePromptFiles, setAvailablePromptFiles } from "@shared/schema";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeSessions = new Map<string, { isRunning: boolean; shouldStop: boolean }>();

// Status tracking for polling
const sessionStatus = new Map<string, {
  isRunning: boolean;
  currentPrompt: number;
  totalPrompts: number;
  error: string | null;
  completed: boolean;
  runningScore1: number;
  runningScore2: number;
  promptCount1: number;  // Track number of prompts for average
  promptCount2: number;  // Track number of prompts for average
}>();

// Translation mapping for few-shot prompt text
const PROMPT_TRANSLATIONS = {
  // English (default)
  'en': {
    examplesHeader: "Here are some examples of similar problems and their solutions:",
    exampleLabel: "Example",
    questionLabel: "Question:",
    answerLabel: "Answer:",
    nowSolveLabel: "Now solve this problem:",
  },
  // Chinese
  'chinese': {
    examplesHeader: "以下是一些类似问题的示例及其解答：",
    exampleLabel: "示例",
    questionLabel: "问题：",
    answerLabel: "答案：",
    nowSolveLabel: "现在解决这个问题：",
  },
  // Arabic
  'arabic': {
    examplesHeader: "إليك بعض الأمثلة على مشاكل مماثلة وحلولها:",
    exampleLabel: "مثال",
    questionLabel: "السؤال:",
    answerLabel: "الجواب:",
    nowSolveLabel: "الآن حل هذه المشكلة:",
  },
  // Hindi
  'hi': {
    examplesHeader: "यहाँ समान समस्याओं के कुछ उदाहरण और उनके समाधान हैं:",
    exampleLabel: "उदाहरण",
    questionLabel: "प्रश्न:",
    answerLabel: "उत्तर:",
    nowSolveLabel: "अब इस समस्या को हल करें:",
  },
  // Bengali
  'bn': {
    examplesHeader: "এখানে অনুরূপ সমস্যার কিছু উদাহরণ এবং তাদের সমাধান রয়েছে:",
    exampleLabel: "উদাহরণ",
    questionLabel: "প্রশ্ন:",
    answerLabel: "উত্তর:",
    nowSolveLabel: "এখন এই সমস্যার সমাধান করুন:",
  },
  // Tamil
  'ta': {
    examplesHeader: "இங்கே இதேபோன்ற பிரச்சினைகளின் சில உதாயரணங்கள் மற்றும் அவற்றின் தீர்வுகள் உள்ளன:",
    exampleLabel: "உதாயரண",
    questionLabel: "கேள்வி:",
    answerLabel: "பதில்:",
    nowSolveLabel: "இப்போது இந்த பிரச்சினையைத் தீர்க்கவும்:",
  },
  // Telugu
  'te': {
    examplesHeader: "ఇక్కడ సారూప్య సమస్యలకు కొన్ని ఉదాహరణలు మరియు వాటి పరిష్కారాలు ఉన్నాయి:",
    exampleLabel: "ఉదాహరణ",
    questionLabel: "ప్రశ్న:",
    answerLabel: "జవాబు:",
    nowSolveLabel: "ఇప్పుడు ఈ సమస్యను పరిష్కరించండి:",
  },
  // Gujarati
  'gu': {
    examplesHeader: "અહીં સમાન સમસ્યાઓના કેટલાક ઉદાહરણો અને તેમના ઉકેલો છે:",
    exampleLabel: "ઉદાહરણ",
    questionLabel: "પ્રશ્ન:",
    answerLabel: "જવાબ:",
    nowSolveLabel: "હવે આ સમસ્યાનો ઉકેલ કરો:",
  },
  // Kannada
  'kn': {
    examplesHeader: "ಇಲ್ಲಿ ಸಮಾನ ಸಮಸ್ಯೆಗಳ ಕೆಲವು ಉದಾಹರಣೆಗಳು ಮತ್ತು ಅವುಗಳ ಪರಿಹಾರಗಳಿವೆ:",
    exampleLabel: "ಉದಾಹರಣೆ",
    questionLabel: "ಪ್ರಶ್ನೆ:",
    answerLabel: "ಉತ್ತರ:",
    nowSolveLabel: "ಈಗ ಈ ಸಮಸ್ಯೆಯನ್ನು ಪರಿಹರಿಸಿ:",
  },
  // Malayalam
  'ml': {
    examplesHeader: "ഇവിടെ സമാന പ്രശ്നങ്ങളുടെ ചില ഉദാഹരണങ്ങളും അവയുടെ പരിഹാരങ്ങളും ഉണ്ട്:",
    exampleLabel: "ഉദാഹരണം",
    questionLabel: "ചോദ്യം:",
    answerLabel: "ഉത്തരം:",
    nowSolveLabel: "ഇപ്പോൾ ഈ പ്രശ്നം പരിഹരിക്കുക:",
  },
  // Marathi
  'mr': {
    examplesHeader: "येथे समान समस्यांची काही उदाहरणे आणि त्यांची उत्तरे आहेत:",
    exampleLabel: "उदाहरण",
    questionLabel: "प्रश्न:",
    answerLabel: "उत्तर:",
    nowSolveLabel: "आता ही समस्या सोडवा:",
  },
  // Odia
  'or': {
    examplesHeader: "ଏଠାରେ ସମାନ ସମସ୍ୟାର କିଛି ଉଦାହରଣ ଏବଂ ସେମାନଙ୍କର ସମାଧାନ ଅଛି:",
    exampleLabel: "ଉଦାହରଣ",
    questionLabel: "ପ୍ରଶ୍ନ:",
    answerLabel: "ଉତ୍ତର:",
    nowSolveLabel: "ବର୍ତ୍ତମାନ ଏହି ସମସ୍ୟାର ସମାଧାନ କରନ୍ତୁ:",
  },
  // Punjabi
  'pa': {
    examplesHeader: "ਇੱਥੇ ਸਮਾਨ ਸਮੱਸਿਆਵਾਂ ਦੀਆਂ ਕੁਝ ਉਦਾਹਰਣਾਂ ਅਤੇ ਉਨ੍ਹਾਂ ਦੇ ਹੱਲ ਹਨ:",
    exampleLabel: "ਉਦਾਹਰਣ",
    questionLabel: "ਸਵਾਲ:",
    answerLabel: "ਜਵਾਬ:",
    nowSolveLabel: "ਹੁਣ ਇਸ ਸਮੱਸਿਆ ਨੂੰ ਹੱਲ ਕਰੋ:",
  },
};

// Function to detect language from prompt file name
function getLanguageFromPromptFile(promptFile: PromptFile): keyof typeof PROMPT_TRANSLATIONS {
  const filename = promptFile.toLowerCase();
  if (filename.includes('chinese')) return 'chinese';
  if (filename.includes('arabic')) return 'arabic';
  if (filename.includes('_bn') || filename.includes('bengali')) return 'bn';
  if (filename.includes('_hi') || filename.includes('hindi')) return 'hi';
  if (filename.includes('_ta') || filename.includes('tamil')) return 'ta';
  if (filename.includes('_te') || filename.includes('telugu')) return 'te';
  if (filename.includes('_gu') || filename.includes('gujarati')) return 'gu';
  if (filename.includes('_kn') || filename.includes('kannada')) return 'kn';
  if (filename.includes('_ml') || filename.includes('malayalam')) return 'ml';
  if (filename.includes('_mr') || filename.includes('marathi')) return 'mr';
  if (filename.includes('_or') || filename.includes('odia')) return 'or';
  if (filename.includes('_pa') || filename.includes('punjabi')) return 'pa';
  
  return 'en'; // Default to English
}

// Function to append response to log file
async function appendToLog(sessionId: string, prompt: string, response: string, model: Model) {
  const date = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
  const logDir = path.join(__dirname, 'logs');
  const logFile = path.join(logDir, `${date}-${sessionId}.log`);

  try {
    // Ensure logs directory exists
    await fs.mkdir(logDir, { recursive: true });
    
    const logEntry = `\n=== Session: ${sessionId} ===\nModel: ${model}\nPrompt: ${prompt}\nResponse: ${response}\n${'-'.repeat(50)}`;
    await fs.appendFile(logFile, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// Function to score a response
function scoreResponse(response: string, expectedAnswer: string): number {
  const modelAnswer = extractFinalAnswer(response);
  const correctAnswer = extractFinalAnswer(expectedAnswer);

  // If we can't extract answers from either, return 0
  if (!modelAnswer || !correctAnswer) {
    return 0;
  }

  // Compare the answers
  return modelAnswer === correctAnswer ? 1 : 0;
}

async function callOpenAIAPI(prompt: string, model: Model): Promise<{ response: string; tokens: number }> {
  
  if (model === 'gemma-3-27b-it' || model === 'gemma-3-1b-it' || model === 'gemma-3-4b-it') {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        maxOutputTokens: 500
      },
    });
    if (!response.text) {
      throw new Error("No response from model");
    }
    return {
      response: response.text,
      tokens: 0,
    };
  }
  // Map our model names to actual API model names and their endpoints
  const modelConfig: Partial<Record<Model, { modelName: string; apiUrl: string; apiKey: string }>> = {
    'gpt-nano': {
      modelName: 'gpt-4.1-nano-2025-04-14',
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY || ""
    },
    'gpt-4.5-preview': {
      modelName: 'gpt-4.5-preview-2025-02-27',
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY || ""
    },
    'gpt-4.1-2025': {
      modelName: 'gpt-4.1-2025-04-14',
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY || ""
    },
    'qwen-2.5-7b': {
      modelName: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      apiUrl: process.env.QWEN_API_URL || "https://api.together.xyz/v1/chat/completions",
      apiKey: process.env.TOGETHER_API_KEY || ""
    },
    'llama-4-maverick': {
      modelName: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      apiUrl: process.env.LLAMA_API_URL || "https://api.together.xyz/v1/chat/completions",
      apiKey: process.env.TOGETHER_API_KEY || ""
    },
    'sarvam-m': {
      modelName: 'sarvam-m',
      apiUrl: process.env.SARVAM_API_URL || 'https://api.sarvam.ai/v1/chat/completions',
      apiKey: process.env.SARVAM_API_KEY || ""
    },
    'mistral': {
      modelName: 'mistralai/Mistral-Small-24B-Instruct-2501',
      apiUrl: process.env.MISTRAL_API_URL || "https://api.together.xyz/v1/chat/completions",
      apiKey: process.env.TOGETHER_API_KEY || ""
    },
    'deepseek-coder-v2-base': {
      modelName: 'accounts/tbarton16/deployedModels/deepseek-coder-v2-lite-base-yvtx5lll',
      apiUrl: process.env.DEEPSEEK_API_URL || "https://api.fireworks.ai/inference/v1/chat/completions",
      apiKey: process.env.FIREWORKS_API_KEY || ""
    },
    'mistral-nemo': {
      modelName: 'accounts/tbarton16/deployedModels/mistral-nemo-base-2407-sp6ek5qe',
      apiUrl: process.env.MISTRAL_NEMO_API_URL || "https://api.fireworks.ai/inference/v1/chat/completions",
      apiKey: process.env.FIREWORKS_API_KEY || ""
    }
    
  };

  const config = modelConfig[model];
  if (!config) {
    throw new Error(`No configuration found for model: ${model}`);
  }
  const apiKey = config.apiKey;
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${model}): ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    response: data.choices[0]?.message?.content || "No response",
    tokens: data.usage?.total_tokens || 0,
  };
}

// Function to load available prompt files from evals directory
async function loadAvailablePromptFiles(): Promise<void> {
  try {
    const evalsDir = path.join(__dirname,"..","server", "evals");
    console.log('Loading available prompt files from:', evalsDir);
    const files = await fs.readdir(evalsDir);
    const promptFiles = files
      .filter(file => file.endsWith('.jsonl'))
      .map(file => path.basename(file, '.jsonl'));
    setAvailablePromptFiles(promptFiles);
    console.log('Loaded available prompt files:', promptFiles);
  } catch (error) {
    console.error('Failed to load available prompt files:', error);
    setAvailablePromptFiles([]);
  }
}

// Function to load prompts from a JSONL file
async function loadPrompts(promptFile: PromptFile): Promise<{ question: string; answer: string }[]> {
  try {
    const promptsPath = path.join(__dirname,"..","server",  "evals", `${promptFile}.jsonl`);
    console.log(`Loading prompts from: ${promptsPath}`);
    
    const content = await fs.readFile(promptsPath, "utf-8");
    return content
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        try {
          const json = JSON.parse(line);
          return {
            question: json.question_chinese || json.question || json.prompt || line,
            answer: json.answer || ""
          };
        } catch {
          return { question: line, answer: "" };
        }
      });
  } catch (error) {
    throw new Error(`Failed to load prompts file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Function to get best score from multiple attempts
async function getBestScore(question: string, answer: string, model: Model): Promise<{ bestScore: number; bestResponse: string; totalTokens: number }> {
  let bestScore = 0;
  let bestResponse = "";
  let totalTokens = 0;

  for (let i = 0; i < 10; i++) {
    try {
      const { response, tokens } = await callOpenAIAPI(question, model);
      const score = scoreResponse(response, answer);
      totalTokens += tokens;

      if (score > bestScore) {
        bestScore = score;
        bestResponse = response;
      }

      // If we got a perfect score, no need to continue
      if (bestScore === 1) {
        break;
      }
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
    }
  }

  return { bestScore, bestResponse, totalTokens };
}

// Function to create few-shot prompt with examples
function createFewShotPrompt(currentQuestion: string, examples: { question: string; answer: string }[], shots: number, promptFile?: PromptFile): string {
  if (shots === 0 || examples.length === 0) {
    return currentQuestion;
  }

  // Randomly select 'shots' number of examples, excluding the current question
  const availableExamples = examples.filter(ex => ex.question !== currentQuestion);
  
  if (availableExamples.length === 0) {
    return currentQuestion;
  }
  
  const selectedExamples = [];
  const examplesCopy = [...availableExamples]; // Create a copy to avoid modifying the original
  
  for (let i = 0; i < Math.min(shots, examplesCopy.length); i++) {
    const randomIndex = Math.floor(Math.random() * examplesCopy.length);
    const selected = examplesCopy.splice(randomIndex, 1)[0];
    selectedExamples.push(selected);
  }

  // Get translations based on prompt file language
  const language = promptFile ? getLanguageFromPromptFile(promptFile) : 'en';
  const translations = PROMPT_TRANSLATIONS[language];

  // Format the prompt with examples using appropriate language
  let prompt = "";
  if (shots > 0) {
    prompt += translations.examplesHeader + "\n\n";
  }
  selectedExamples.forEach((example, index) => {
    prompt += `${translations.exampleLabel} ${index + 1}:\n${translations.questionLabel} ${example.question}\n${translations.answerLabel} ${extractFinalAnswer(example.answer)}\n\n`;
  });

  if (shots > 0) {
    prompt += `${translations.nowSolveLabel}\n${translations.questionLabel} ${currentQuestion}\n${translations.answerLabel}`;
  } else {
    prompt += `${currentQuestion}\n:`;
  }
  
  return prompt;
}

const ZEROES = [
  0x0966, // Hindi/Devanagari ०
  0x09E6, // Bengali ০
  0x0B66, // Odia ୦
  0x0BE6, // Tamil ௦
  0x0CE6, // Kannada ೦
  0x0D66  // Malayalam ൦
];

const toLatinDigits = (s: string): string => {
  return Array.from(s, ch => {
    const cp = ch.codePointAt(0)!;

    // Fast-path for ASCII digits
    if (cp >= 0x30 && cp <= 0x39) return ch;

    for (const zero of ZEROES) {
      if (cp >= zero && cp <= zero + 9) {
        return String(cp - zero);    // distance from that script’s “0”
      }
    }
    return ch;                       // leave everything else untouched
  }).join('');
};

const extractFinalAnswer = (text: string): string => {

  const asciiText = toLatinDigits(text);
  // First try to find the pattern "#### number" at the end
  const match = asciiText.match(/####\s*([\d,]+)$/);
  if (match) {
    // Remove commas from the matched number
    return match[1].replace(/,/g, '');
  }
  // If no match, try to find the last number in the text
  const numbers = asciiText.match(/\d+(?:[,.]\d+)*/g);
  if (numbers) {
    // Remove commas from the last number
    return numbers[numbers.length - 1].replace(/,/g, '');
  }
  return "";
}

async function executePrompts(sessionId: string, model: Model, promptFile: PromptFile, shots: number = 1) {
  console.log(`Starting execution for session: ${sessionId} with model: ${model}, prompt file: ${promptFile}, and ${shots} shots`);
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.log(`No session found for: ${sessionId}`);
    return;
  }

  try {
    console.log("Loading prompts...");
    const prompts = await loadPrompts(promptFile);
    console.log(`Loaded ${prompts.length} prompts`);
    
    // Update session status
    sessionStatus.set(sessionId, {
      isRunning: true,
      currentPrompt: 0,
      totalPrompts: prompts.length,
      error: null,
      completed: false,
      runningScore1: 0,
      runningScore2: 0,
      promptCount1: 0,
      promptCount2: 0
    });

    for (let i = 0; i < prompts.length; i++) {
      if (session.shouldStop) {
        sessionStatus.set(sessionId, {
          isRunning: false,
          currentPrompt: i + 1,
          totalPrompts: prompts.length,
          error: null,
          completed: false,
          runningScore1: sessionStatus.get(sessionId)?.runningScore1 || 0,
          runningScore2: sessionStatus.get(sessionId)?.runningScore2 || 0,
          promptCount1: sessionStatus.get(sessionId)?.promptCount1 || 0,
          promptCount2: sessionStatus.get(sessionId)?.promptCount2 || 0
        });
        return;
      }

      const { question, answer } = prompts[i];
      
      // Update current prompt
      const status = sessionStatus.get(sessionId);
      if (status) {
        status.currentPrompt = i + 1;
      }
      
      // Create pending result
      const fewShotPrompt = createFewShotPrompt(question, prompts, shots, promptFile);
      const pendingResult = await storage.createExecutionResult({
        sessionId,
        promptIndex: i + 1,
        //prompt: question,
        prompt: fewShotPrompt,
        response: null,
        status: "pending",
        error: null,
        duration: null,
        tokens: null,
        model,
        answer: answer,
      });

      const startTime = Date.now();
      
      try {
        // Create few-shot prompt if shots > 0
        // const fewShotPrompt = createFewShotPrompt(question, prompts, shots);
        
        // Get single attempt for score1 using few-shot prompt
        const { response: singleResponse, tokens: singleTokens } = await callOpenAIAPI(fewShotPrompt, model);
        const singleScore = scoreResponse(singleResponse, answer);
        
        // Get best of n attempts for score2 using few-shot prompt
        const { bestScore, bestResponse, totalTokens } = await getBestScore(fewShotPrompt, answer, model);
        const duration = Date.now() - startTime;

        const extractedAnswer = extractFinalAnswer(singleResponse);

        // Log both responses (with the few-shot prompt)
        await appendToLog(sessionId, fewShotPrompt, singleResponse, model);
        await appendToLog(sessionId, fewShotPrompt, bestResponse, model);
        
        // Update running scores
        const currentStatus = sessionStatus.get(sessionId);
        if (currentStatus) {
          // Update score1 (single attempt)
          currentStatus.promptCount1++;
          currentStatus.runningScore1 = (currentStatus.runningScore1 * (currentStatus.promptCount1 - 1) + singleScore) / currentStatus.promptCount1;
          
          // Update score2 (best of n)
          currentStatus.promptCount2++;
          currentStatus.runningScore2 = (currentStatus.runningScore2 * (currentStatus.promptCount2 - 1) + bestScore) / currentStatus.promptCount2;
          
          console.log(`Updated scores for session ${sessionId}:`, {
            score1: currentStatus.runningScore1,
            score2: currentStatus.runningScore2,
            promptCount1: currentStatus.promptCount1,
            promptCount2: currentStatus.promptCount2,
            singleScore,
            bestScore
          });
        }

        await storage.updateExecutionResult(pendingResult.id, {
          response: singleResponse,
          status: "success",
          duration,
          tokens: singleTokens + totalTokens,
          score: singleScore,
          bestScore: bestScore,
          answer: answer,
          extractedAnswer: extractedAnswer,
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        await storage.updateExecutionResult(pendingResult.id, {
          status: "error",
          error: errorMessage,
          duration,
        });
      }
    }

    // Mark as completed
    sessionStatus.set(sessionId, {
      isRunning: false,
      currentPrompt: prompts.length,
      totalPrompts: prompts.length,
      error: null,
      completed: true,
      runningScore1: sessionStatus.get(sessionId)?.runningScore1 || 0,
      runningScore2: sessionStatus.get(sessionId)?.runningScore2 || 0,
      promptCount1: sessionStatus.get(sessionId)?.promptCount1 || 0,
      promptCount2: sessionStatus.get(sessionId)?.promptCount2 || 0
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    sessionStatus.set(sessionId, {
      isRunning: false,
      currentPrompt: 0,
      totalPrompts: 0,
      error: errorMessage,
      completed: false,
      runningScore1: 0,
      runningScore2: 0,
      promptCount1: 0,
      promptCount2: 0
    });
  } finally {
    session.isRunning = false;
    session.shouldStop = false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Load available prompt files on startup
  await loadAvailablePromptFiles();

  // Add endpoint to refresh available prompt files
  app.get("/api/prompt-files", async (req, res) => {
    try {
      await loadAvailablePromptFiles();
      res.json({ files: getAvailablePromptFiles() });
    } catch (error) {
      console.error("Failed to load prompt files:", error);
      res.status(500).json({ error: "Failed to load prompt files" });
    }
  });

  // API Routes
  app.post("/api/start-execution", async (req, res) => {
    try {
      const { sessionId, model, promptFile, shots } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      if (!model || !AVAILABLE_MODELS.includes(model)) {
        return res.status(400).json({ error: "Invalid model selected" });
      }

      if (!promptFile || !getAvailablePromptFiles().includes(promptFile)) {
        return res.status(400).json({ error: "Invalid prompt file selected" });
      }

      if (shots === undefined || shots < 0 || shots > 8) {
        return res.status(400).json({ error: "Invalid shots value. Must be between 0 and 8." });
      }

      let session = activeSessions.get(sessionId);
      if (!session) {
        session = { isRunning: false, shouldStop: false };
        activeSessions.set(sessionId, session);
      }

      if (session.isRunning) {
        return res.status(400).json({ error: "Execution already running" });
      }

      session.isRunning = true;
      session.shouldStop = false;

      // Start execution in background
      executePrompts(sessionId, model, promptFile, shots).catch((error) => {
        console.error("Execution error:", error);
        sessionStatus.set(sessionId, {
          isRunning: false,
          currentPrompt: 0,
          totalPrompts: 0,
          error: error.message,
          completed: false,
          runningScore1: 0,
          runningScore2: 0,
          promptCount1: 0,
          promptCount2: 0
        });
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Start execution error:", error);
      res.status(500).json({ error: "Failed to start execution" });
    }
  });

  app.post("/api/stop-execution", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      let session = activeSessions.get(sessionId);
      if (!session) {
        session = { isRunning: false, shouldStop: false };
        activeSessions.set(sessionId, session);
      }

      session.shouldStop = true;

      res.json({ success: true });
    } catch (error) {
      console.error("Stop execution error:", error);
      res.status(500).json({ error: "Failed to stop execution" });
    }
  });

  app.get("/api/execution-status/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      console.log('Fetching execution status for session:', sessionId);
      
      if (!sessionId) {
        console.error('No sessionId provided');
        return res.status(400).json({ error: "Session ID is required" });
      }

      const status = sessionStatus.get(sessionId) || {
        isRunning: false,
        currentPrompt: 0,
        totalPrompts: 0,
        error: null,
        completed: false,
        runningScore1: 0,
        runningScore2: 0,
        promptCount1: 0,
        promptCount2: 0
      };
      
      console.log(`Sending status for session ${sessionId}:`, status);
      res.json(status);
    } catch (error) {
      console.error("Get status error:", error);
      res.status(500).json({ 
        error: "Failed to get status",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/execution-results/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      console.log('Fetching execution results for session:', sessionId);
      
      if (!sessionId) {
        console.error('No sessionId provided');
        return res.status(400).json({ error: "Session ID is required" });
      }

      const results = await storage.getExecutionResultsBySession(sessionId);
      console.log(`Found ${results.length} results for session ${sessionId}`);
      
      res.json(results);
    } catch (error) {
      console.error("Get results error:", error);
      res.status(500).json({ 
        error: "Failed to get results",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/execution-results/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await storage.clearExecutionResults(sessionId);
      sessionStatus.delete(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Clear results error:", error);
      res.status(500).json({ error: "Failed to clear results" });
    }
  });

  app.get("/api/prompts/count", async (req, res) => {
    try {
      const { promptFile } = req.query;
      if (!promptFile || typeof promptFile !== 'string') {
        return res.status(400).json({ error: "Prompt file is required" });
      }
      const prompts = await loadPrompts(promptFile);
      res.json({ count: prompts.length });
    } catch (error) {
      console.error("Get prompts count error:", error);
      res.status(500).json({ error: "Failed to get prompts count" });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      // Load preloaded data from CSV
      
      const allResults = await storage.getAllExecutionResults();
      
      // Group results by model and prompt file
      const leaderboardData = new Map<string, {
        model: string;
        promptFile: string;
        bestOf1: number;
        bestOf10: number;
        totalPrompts: number;
        completedPrompts: number;
        isPreloaded?: boolean;
      }>();

      // Process dynamic results from database
      for (const result of allResults) {
        if (!result.model || !result.sessionId || result.status !== 'success') continue;
        
        // For dynamic results, use 'combined' as prompt file or extract from sessionId if available
        const promptFile = 'combined';
        const key = `${result.model}-${promptFile}`;
        
        if (!leaderboardData.has(key)) {
          leaderboardData.set(key, {
            model: result.model,
            promptFile: promptFile,
            bestOf1: 0,
            bestOf10: 0,
            totalPrompts: 0,
            completedPrompts: 0,
            isPreloaded: false
          });
        }

        const entry = leaderboardData.get(key)!;
        if (!entry.isPreloaded) {
          entry.completedPrompts += 1;
          
          // For best of 1, take the score directly
          entry.bestOf1 += result.score || 0;
          
          // For best of 10, use the bestScore field
          entry.bestOf10 += result.bestScore || 0;
        }
      }

      // Convert to array and calculate averages for dynamic data
      const leaderboard = Array.from(leaderboardData.values()).map(entry => ({
        ...entry,
        bestOf1: entry.isPreloaded ? entry.bestOf1 : (entry.completedPrompts > 0 ? entry.bestOf1 / entry.completedPrompts : 0),
        bestOf10: entry.isPreloaded ? entry.bestOf10 : (entry.completedPrompts > 0 ? entry.bestOf10 / entry.completedPrompts : 0),
        totalPrompts: entry.completedPrompts
      }));

      // Sort by best of 10 score descending
      leaderboard.sort((a, b) => b.bestOf10 - a.bestOf10);

      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ error: "Failed to get leaderboard data" });
    }
  });

  return httpServer;
}