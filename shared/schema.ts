import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const executionResults = pgTable("execution_results", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  promptIndex: integer("prompt_index").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response"),
  status: text("status").notNull(), // 'pending', 'success', 'error'
  error: text("error"),
  duration: integer("duration"), // in milliseconds
  tokens: integer("tokens"),
  score: real("score"), // Score between 0 and 1
  model: text("model").notNull().default('gpt-nano'),
  answer: text("answer"), // Expected answer for the prompt
  extractedAnswer: text("extracted_answer"), // The answer extracted from the model's response
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertExecutionResultSchema = createInsertSchema(executionResults).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ExecutionResult = typeof executionResults.$inferSelect;
export type InsertExecutionResult = z.infer<typeof insertExecutionResultSchema>;

// WebSocket message types
export type WebSocketMessage = 
  | { type: 'execution_started'; sessionId: string; totalPrompts: number }
  | { type: 'prompt_processing'; sessionId: string; promptIndex: number; prompt: string }
  | { type: 'prompt_completed'; sessionId: string; result: ExecutionResult }
  | { type: 'execution_stopped'; sessionId: string }
  | { type: 'execution_completed'; sessionId: string }
  | { type: 'error'; sessionId: string; error: string };

// Model types
export type Model = 'gpt-nano' | 'gemma' | 'qwen' | 'llama' | 'sarvam-m';

export const AVAILABLE_MODELS: Model[] = ['gpt-nano', 'gemma', 'qwen', 'llama', 'sarvam-m'];

// PromptFile type is now a string that represents the filename without extension
export type PromptFile = string;

// Function to get available prompt files
let _availablePromptFiles: PromptFile[] = [];
export function getAvailablePromptFiles(): PromptFile[] {
  return _availablePromptFiles;
}
export function setAvailablePromptFiles(files: PromptFile[]): void {
  _availablePromptFiles = files;
}
