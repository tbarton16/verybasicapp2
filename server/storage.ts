import { users, executionResults, type User, type InsertUser, type ExecutionResult, type InsertExecutionResult } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Execution results
  createExecutionResult(result: InsertExecutionResult): Promise<ExecutionResult>;
  getExecutionResultsBySession(sessionId: string): Promise<ExecutionResult[]>;
  updateExecutionResult(id: number, updates: Partial<ExecutionResult>): Promise<ExecutionResult | undefined>;
  clearExecutionResults(sessionId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private executionResults: Map<number, ExecutionResult>;
  private currentUserId: number;
  private currentResultId: number;

  constructor() {
    this.users = new Map();
    this.executionResults = new Map();
    this.currentUserId = 1;
    this.currentResultId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createExecutionResult(insertResult: InsertExecutionResult): Promise<ExecutionResult> {
    const id = this.currentResultId++;
    const result: ExecutionResult = { 
      id,
      sessionId: insertResult.sessionId,
      promptIndex: insertResult.promptIndex,
      prompt: insertResult.prompt,
      response: insertResult.response ?? null,
      status: insertResult.status,
      error: insertResult.error ?? null,
      duration: insertResult.duration ?? null,
      tokens: insertResult.tokens ?? null,
      score: insertResult.score ?? null,
      model: insertResult.model ?? 'gpt-nano',
      createdAt: new Date()
    };
    this.executionResults.set(id, result);
    return result;
  }

  async getExecutionResultsBySession(sessionId: string): Promise<ExecutionResult[]> {
    console.log('Storage: Getting results for session:', sessionId);
    try {
      const results = Array.from(this.executionResults.values())
        .filter(result => result.sessionId === sessionId)
        .sort((a, b) => a.promptIndex - b.promptIndex);
      
      console.log(`Storage: Found ${results.length} results for session ${sessionId}`);
      return results;
    } catch (error) {
      console.error('Storage: Error getting results:', error);
      throw new Error(`Failed to get execution results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateExecutionResult(id: number, updates: Partial<ExecutionResult>): Promise<ExecutionResult | undefined> {
    console.log('Storage: Updating result:', { id, updates });
    try {
      const existing = this.executionResults.get(id);
      if (!existing) {
        console.log('Storage: No existing result found for id:', id);
        return undefined;
      }
      
      const updated = { ...existing, ...updates };
      this.executionResults.set(id, updated);
      console.log('Storage: Updated result:', updated);
      return updated;
    } catch (error) {
      console.error('Storage: Error updating result:', error);
      throw new Error(`Failed to update execution result: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async clearExecutionResults(sessionId: string): Promise<void> {
    const toDelete = Array.from(this.executionResults.entries())
      .filter(([_, result]) => result.sessionId === sessionId)
      .map(([id]) => id);
    
    toDelete.forEach(id => this.executionResults.delete(id));
  }
}

export const storage = new MemStorage();
