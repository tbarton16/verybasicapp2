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
  // Extract the final answer from both responses
  const extractFinalAnswer = (text: string): string => {
    // Look for the pattern "#### number" at the end
    const match = text.match(/####\s*(\d+)$/);
    if (match) {
      return match[1];
    }
    // If no match, try to find the last number in the text
    const numbers = text.match(/\d+/g);
    return numbers ? numbers[numbers.length - 1] : "";
  };

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
  
  if (model === 'gemma') {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
  const modelConfig: Record<Model, { modelName: string; apiUrl: string; apiKey: string }> = {
    'gpt-nano': {
      modelName: 'gpt-3.5-turbo',
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY || ""
    },
    'gemma': {
      modelName: 'gemini-2.0-flash',
      apiUrl: process.env.GEMMA_API_URL || 'https://api.gemma.ai/v1/chat/completions',
      apiKey: process.env.API_KEY || ""
    },
    'qwen': {
      modelName: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      apiUrl: process.env.QWEN_API_URL || "https://api.together.xyz/v1/chat/completions",
      apiKey: process.env.TOGETHER_API_KEY || ""
    },
    'llama': {
      modelName: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      apiUrl: process.env.LLAMA_API_URL || "https://api.together.xyz/v1/chat/completions",
      apiKey: process.env.TOGETHER_API_KEY || ""
    }
  };

  const config = modelConfig[model];
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
async function getBestScore(question: string, answer: string, model: Model, numAttempts: number = 10): Promise<{ bestScore: number; bestResponse: string; totalTokens: number }> {
  let bestScore = 0;
  let bestResponse = "";
  let totalTokens = 0;

  for (let i = 0; i < numAttempts; i++) {
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

async function executePrompts(sessionId: string, model: Model, promptFile: PromptFile) {
  console.log(`Starting execution for session: ${sessionId} with model: ${model} and prompt file: ${promptFile}`);
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
      const pendingResult = await storage.createExecutionResult({
        sessionId,
        promptIndex: i + 1,
        prompt: question,
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
        // Get single attempt for score1
        const { response: singleResponse, tokens: singleTokens } = await callOpenAIAPI(question, model);
        const singleScore = scoreResponse(singleResponse, answer);
        
        // Get best of n attempts for score2
        const { bestScore, bestResponse, totalTokens } = await getBestScore(question, answer, model);
        const duration = Date.now() - startTime;

        // Log both responses
        await appendToLog(sessionId, question, singleResponse, model);
        await appendToLog(sessionId, question, bestResponse, model);
        
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
          answer: answer,
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
      const { sessionId, model, promptFile } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      if (!model || !AVAILABLE_MODELS.includes(model)) {
        return res.status(400).json({ error: "Invalid model selected" });
      }

      if (!promptFile || !getAvailablePromptFiles().includes(promptFile)) {
        return res.status(400).json({ error: "Invalid prompt file selected" });
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
      executePrompts(sessionId, model, promptFile).catch((error) => {
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

  return httpServer;
}