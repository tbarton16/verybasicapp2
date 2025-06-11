import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
