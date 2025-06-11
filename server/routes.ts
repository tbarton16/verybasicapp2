import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertExecutionResultSchema, type WebSocketMessage, type ExecutionResult } from "@shared/schema";
import fs from "fs/promises";
import path from "path";

const activeConnections = new Map<string, WebSocket>();
const activeSessions = new Map<string, { isRunning: boolean; shouldStop: boolean }>();

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

function broadcastToSession(sessionId: string, message: WebSocketMessage) {
  const ws = activeConnections.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function executePrompts(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  try {
    const prompts = await loadPrompts();
    
    broadcastToSession(sessionId, {
      type: "execution_started",
      sessionId,
      totalPrompts: prompts.length,
    });

    for (let i = 0; i < prompts.length; i++) {
      if (session.shouldStop) {
        broadcastToSession(sessionId, {
          type: "execution_stopped",
          sessionId,
        });
        return;
      }

      const prompt = prompts[i];
      
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

      broadcastToSession(sessionId, {
        type: "prompt_processing",
        sessionId,
        promptIndex: i + 1,
        prompt,
      });

      const startTime = Date.now();
      
      try {
        const { response, tokens } = await callOpenAIAPI(prompt);
        const duration = Date.now() - startTime;

        const completedResult = await storage.updateExecutionResult(pendingResult.id, {
          response,
          status: "success",
          duration,
          tokens,
        });

        if (completedResult) {
          broadcastToSession(sessionId, {
            type: "prompt_completed",
            sessionId,
            result: completedResult,
          });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        const failedResult = await storage.updateExecutionResult(pendingResult.id, {
          status: "error",
          error: errorMessage,
          duration,
        });

        if (failedResult) {
          broadcastToSession(sessionId, {
            type: "prompt_completed",
            sessionId,
            result: failedResult,
          });
        }
      }
    }

    broadcastToSession(sessionId, {
      type: "execution_completed",
      sessionId,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    broadcastToSession(sessionId, {
      type: "error",
      sessionId,
      error: errorMessage,
    });
  } finally {
    session.isRunning = false;
    session.shouldStop = false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // WebSocket connection handling
  wss.on("connection", (ws, req) => {
    const sessionId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get("sessionId");
    
    if (!sessionId) {
      ws.close(1008, "Session ID required");
      return;
    }

    activeConnections.set(sessionId, ws);
    activeSessions.set(sessionId, { isRunning: false, shouldStop: false });

    ws.on("close", () => {
      activeConnections.delete(sessionId);
      const session = activeSessions.get(sessionId);
      if (session) {
        session.shouldStop = true;
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  // API Routes
  app.post("/api/start-execution", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(400).json({ error: "Session not found" });
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

      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(400).json({ error: "Session not found" });
      }

      session.shouldStop = true;

      res.json({ success: true });
    } catch (error) {
      console.error("Stop execution error:", error);
      res.status(500).json({ error: "Failed to stop execution" });
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
