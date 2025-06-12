import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExecutionResultSchema, type ExecutionResult, type Model, AVAILABLE_MODELS } from "@shared/schema";
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
}>();

async function callOpenAIAPI(prompt: string, model: Model): Promise<{ response: string; tokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || "";
  
  if (!apiKey) {
    throw new Error("API key not configured");
  }
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
  const modelConfig: Record<Model, { modelName: string; apiUrl: string }> = {
    'gpt-nano': {
      modelName: 'gpt-3.5-turbo',
      apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
    },
    'gemma': {
      modelName: 'gemini-2.0-flash',
      apiUrl: process.env.GEMMA_API_URL || 'https://api.gemma.ai/v1/chat/completions'
    },
    'qwen': {
      modelName: 'qwen-7b',
      apiUrl: process.env.QWEN_API_URL || 'https://api.qwen.ai/v1/chat/completions'
    },
    'llama': {
      modelName: 'llama-2-7b',
      apiUrl: process.env.LLAMA_API_URL || 'https://api.llama.ai/v1/chat/completions'
    }
  };

  const config = modelConfig[model];
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
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

async function loadPrompts(): Promise<string[]> {
  try {
    const promptsPath = path.join(__dirname, "..", "server", "prompts.txt");
    console.log(promptsPath)
    const content = await fs.readFile(promptsPath, "utf-8");
    return content
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    throw new Error("Failed to load prompts file");
  }
}

async function executePrompts(sessionId: string, model: Model) {
  console.log(`Starting execution for session: ${sessionId} with model: ${model}`);
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.log(`No session found for: ${sessionId}`);
    return;
  }

  try {
    console.log("Loading prompts...");
    const prompts = await loadPrompts();
    console.log(`Loaded ${prompts.length} prompts`);
    
    // Update session status
    sessionStatus.set(sessionId, {
      isRunning: true,
      currentPrompt: 0,
      totalPrompts: prompts.length,
      error: null,
      completed: false
    });

    for (let i = 0; i < prompts.length; i++) {
      if (session.shouldStop) {
        sessionStatus.set(sessionId, {
          isRunning: false,
          currentPrompt: i + 1,
          totalPrompts: prompts.length,
          error: null,
          completed: false
        });
        return;
      }

      const prompt = prompts[i];
      
      // Update current prompt
      const status = sessionStatus.get(sessionId);
      if (status) {
        status.currentPrompt = i + 1;
      }
      
      // Create pending result
      const pendingResult = await storage.createExecutionResult({
        sessionId,
        promptIndex: i + 1,
        prompt,
        response: null,
        status: "pending",
        error: null,
        duration: null,
        tokens: null,
        model,
      });

      const startTime = Date.now();
      
      try {
        const { response, tokens } = await callOpenAIAPI(prompt, model);
        const duration = Date.now() - startTime;

        await storage.updateExecutionResult(pendingResult.id, {
          response,
          status: "success",
          duration,
          tokens,
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
      completed: true
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    sessionStatus.set(sessionId, {
      isRunning: false,
      currentPrompt: 0,
      totalPrompts: 0,
      error: errorMessage,
      completed: false
    });
  } finally {
    session.isRunning = false;
    session.shouldStop = false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // API Routes
  app.post("/api/start-execution", async (req, res) => {
    try {
      const { sessionId, model } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      if (!model || !AVAILABLE_MODELS.includes(model)) {
        return res.status(400).json({ error: "Invalid model selected" });
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
      executePrompts(sessionId, model).catch((error) => {
        console.error("Execution error:", error);
        sessionStatus.set(sessionId, {
          isRunning: false,
          currentPrompt: 0,
          totalPrompts: 0,
          error: error.message,
          completed: false
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
      const status = sessionStatus.get(sessionId) || {
        isRunning: false,
        currentPrompt: 0,
        totalPrompts: 0,
        error: null,
        completed: false
      };
      res.json(status);
    } catch (error) {
      console.error("Get status error:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.get("/api/execution-results/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const results = await storage.getExecutionResultsBySession(sessionId);
      res.json(results);
    } catch (error) {
      console.error("Get results error:", error);
      res.status(500).json({ error: "Failed to get results" });
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
      const prompts = await loadPrompts();
      res.json({ count: prompts.length });
    } catch (error) {
      console.error("Get prompts count error:", error);
      res.status(500).json({ error: "Failed to get prompts count" });
    }
  });

  return httpServer;
}