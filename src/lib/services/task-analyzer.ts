/**
 * TaskAnalyzer Service
 * 
 * Analyzes task descriptions to extract:
 * - Keywords (using TF-IDF)
 * - Domain classification (backend, frontend, data, etc.)
 * - Layer identification (api, ui, database, etc.)
 * - Required skills
 * - Confidence scores
 */

import type { Task, TaskAnalysis } from '../types';

// Domain keyword patterns
const DOMAIN_PATTERNS = {
  backend: [
    'api', 'endpoint', 'server', 'database', 'migration', 'schema', 
    'auth', 'authentication', 'authorization', 'middleware', 'route',
    'service', 'controller', 'model', 'orm', 'sql', 'query'
  ],
  frontend: [
    'ui', 'interface', 'component', 'page', 'view', 'form', 'button',
    'modal', 'layout', 'style', 'css', 'design', 'responsive', 'react',
    'nextjs', 'navigation', 'menu', 'dashboard', 'chart'
  ],
  data: [
    'analytics', 'report', 'etl', 'pipeline', 'aggregation', 'metric',
    'visualization', 'export', 'import', 'transform', 'analysis'
  ],
  infrastructure: [
    'deploy', 'docker', 'ci/cd', 'pipeline', 'monitoring', 'logging',
    'performance', 'scaling', 'backup', 'security', 'ssl', 'https'
  ],
  testing: [
    'test', 'unit test', 'integration test', 'e2e', 'coverage', 'mock',
    'fixture', 'assertion', 'spec', 'validation'
  ]
};

// Layer keyword patterns
const LAYER_PATTERNS = {
  api: [
    'endpoint', 'route', 'rest', 'graphql', 'api', 'request', 'response',
    'middleware', 'handler', 'controller'
  ],
  ui: [
    'component', 'page', 'view', 'form', 'button', 'modal', 'layout',
    'style', 'design', 'interface', 'navigation'
  ],
  database: [
    'schema', 'migration', 'table', 'column', 'index', 'query', 'model',
    'orm', 'sql', 'database', 'data model'
  ],
  business_logic: [
    'service', 'logic', 'calculation', 'validation', 'rule', 'workflow',
    'process', 'algorithm'
  ],
  integration: [
    'third-party', 'webhook', 'oauth', 'external api', 'integration',
    'connector', 'adapter'
  ]
};

// Skill keyword patterns
const SKILL_PATTERNS = {
  typescript: ['typescript', 'ts', 'type'],
  react: ['react', 'jsx', 'hooks', 'component'],
  nextjs: ['nextjs', 'next.js', 'app router', 'server component'],
  nodejs: ['nodejs', 'node.js', 'express'],
  database: ['prisma', 'sql', 'postgresql', 'sqlite', 'database'],
  api_design: ['rest api', 'graphql', 'endpoint', 'api design'],
  testing: ['jest', 'vitest', 'testing-library', 'unit test'],
  auth: ['authentication', 'authorization', 'jwt', 'oauth'],
  ui_design: ['tailwind', 'css', 'responsive', 'design system']
};

/**
 * Simple TF-IDF implementation for keyword extraction
 */
class TFIDFAnalyzer {
  private stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);

  /**
   * Tokenize and clean text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  /**
   * Calculate term frequency
   */
  private calculateTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const totalTerms = tokens.length;

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Normalize by total terms
    Array.from(tf.entries()).forEach(([term, count]) => {
      tf.set(term, count / totalTerms);
    });

    return tf;
  }

  /**
   * Extract top keywords using TF scoring (simplified TF-IDF for single document)
   */
  extractKeywords(text: string, topN: number = 10): string[] {
    const tokens = this.tokenize(text);
    const tf = this.calculateTF(tokens);

    // Sort by frequency and return top N
    return Array.from(tf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([term]) => term);
  }
}

/**
 * Main TaskAnalyzer class
 */
export class TaskAnalyzer {
  private tfidf = new TFIDFAnalyzer();

  /**
   * Analyze a task and extract domain, layer, skills, and confidence
   */
  analyze(task: Task): TaskAnalysis {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    
    // Extract keywords
    const keywords = this.tfidf.extractKeywords(text);

    // Detect domain
    const domain = this.detectDomain(text, keywords);

    // Detect layer
    const layer = this.detectLayer(text, keywords);

    // Detect skills
    const skills = this.detectSkills(text, keywords);

    // Calculate confidence
    const confidence = this.calculateConfidence(domain, layer, skills);

    return {
      keywords,
      domain: domain.name,
      layer: layer.name,
      skills,
      confidence
    };
  }

  /**
   * Detect the primary domain
   */
  private detectDomain(text: string, _keywords: string[]): { name: string; score: number } {
    const scores = new Map<string, number>();

    for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
      let score = 0;
      
      for (const pattern of patterns) {
        // Check in full text (phrase matching)
        if (text.includes(pattern)) {
          score += 2;
        }
        
        // Check in keywords (individual word matching)
        if (keywords.includes(pattern.replace(/\s+/g, ''))) {
          score += 1;
        }
      }
      
      scores.set(domain, score);
    }

    // Return highest scoring domain
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 && sorted[0][1] > 0
      ? { name: sorted[0][0], score: sorted[0][1] }
      : { name: 'general', score: 0 };
  }

  /**
   * Detect the primary layer
   */
  private detectLayer(text: string, _keywords: string[]): { name: string; score: number } {
    const scores = new Map<string, number>();

    for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
      let score = 0;
      
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          score += 2;
        }
        if (keywords.includes(pattern.replace(/\s+/g, ''))) {
          score += 1;
        }
      }
      
      scores.set(layer, score);
    }

    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 && sorted[0][1] > 0
      ? { name: sorted[0][0], score: sorted[0][1] }
      : { name: 'general', score: 0 };
  }

  /**
   * Detect required skills
   */
  private detectSkills(text: string, __keywords: string[]): string[] {
    const detectedSkills: string[] = [];

    for (const [skill, patterns] of Object.entries(SKILL_PATTERNS)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          detectedSkills.push(skill);
          break; // Only add skill once
        }
      }
    }

    return detectedSkills;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    domain: { name: string; score: number },
    layer: { name: string; score: number },
    skills: string[]
  ): number {
    let confidence = 0;

    // Base confidence from domain detection
    if (domain.score > 0) {
      confidence += Math.min(domain.score / 10, 0.4); // Max 0.4
    }

    // Additional confidence from layer detection
    if (layer.score > 0) {
      confidence += Math.min(layer.score / 10, 0.3); // Max 0.3
    }

    // Additional confidence from skill detection
    if (skills.length > 0) {
      confidence += Math.min(skills.length * 0.1, 0.3); // Max 0.3
    }

    return Math.min(Math.max(confidence, 0.1), 1.0); // Clamp between 0.1 and 1.0
  }
}

// Singleton instance
export const taskAnalyzer = new TaskAnalyzer();
