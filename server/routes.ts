import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExecutionResultSchema, type ExecutionResult } from "@shared/schema";
import fs from "fs/promises";
import path from "path";

const activeSessions = new Map<string, { isRunning: boolean; shouldStop: boolean }>();

// Status tracking for polling
const sessionStatus = new Map<string, {
  isRunning: boolean;
  currentPrompt: number;
  totalPrompts: number;
  error: string | null;
  completed: boolean;
}>();

async function callOpenAIAPI(prompt: string): Promise<{ response: string; tokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || "";
  const apiUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    response: data.choices[0]?.message?.content || "No response",
    tokens: data.usage?.total_tokens || 0,
  };
}

async function loadPrompts(): Promise<string[]> {
  try {
    const promptsPath = path.join(import.meta.dirname, "prompts.txt");
    const content = await fs.readFile(promptsPath, "utf-8");
    return content
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    throw new Error("Failed to load prompts file");
  }
}

async function executePrompts(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  try {
    const prompts = await loadPrompts();
    
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
      });

      const startTime = Date.now();
      
      try {
        const { response, tokens } = await callOpenAIAPI(prompt);
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
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
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
      executePrompts(sessionId).catch(console.error);

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