/**
 * Unit tests for TaskAnalyzer service
 * 
 * Coverage:
 * - TF-IDF keyword extraction
 * - Domain detection (backend, frontend, data, etc.)
 * - Layer detection (api, ui, database, etc.)
 * - Skill detection
 * - Confidence scoring
 */

import { describe, it, expect } from 'vitest';
import { TaskAnalyzer } from '../task-analyzer';
import type { Task } from '../../types';

describe('TaskAnalyzer', () => {
  const analyzer = new TaskAnalyzer();

  // Helper to create test task
  const createTask = (title: string, description: string): Task => ({
    id: 'test-task-1',
    title,
    description,
    status: 'inbox',
    priority: 'normal',
    workspace_id: 'default',
    business_id: 'default',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  });

  describe('Keyword Extraction', () => {
    it('should extract relevant keywords from task text', () => {
      const task = createTask(
        'Build REST API endpoint',
        'Create a new endpoint for user authentication using JWT tokens'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.keywords).toBeDefined();
      expect(analysis.keywords.length).toBeGreaterThan(0);
      expect(analysis.keywords).toContain('api');
    });

    it('should filter out stop words', () => {
      const task = createTask(
        'The API will be created',
        'This is a test description with many stop words like the, and, or, but'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.keywords).not.toContain('the');
      expect(analysis.keywords).not.toContain('and');
      expect(analysis.keywords).not.toContain('or');
    });
  });

  describe('Domain Detection', () => {
    it('should detect backend domain for API tasks', () => {
      const task = createTask(
        'Implement REST API endpoint',
        'Create a new API endpoint with database migration and authentication middleware'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('backend');
    });

    it('should detect frontend domain for UI tasks', () => {
      const task = createTask(
        'Build user dashboard',
        'Create a responsive dashboard component with React and TailwindCSS showing charts and navigation'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('frontend');
    });

    it('should detect data domain for analytics tasks', () => {
      const task = createTask(
        'Create analytics report',
        'Build ETL pipeline for data aggregation and generate visualization reports'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('data');
    });

    it('should detect testing domain', () => {
      const task = createTask(
        'Write unit tests',
        'Add unit test coverage for authentication service with mocks and fixtures'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('testing');
    });

    it('should handle tasks without clear domain', () => {
      const task = createTask(
        'Update documentation',
        'Improve the README file with better examples'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBeDefined();
    });
  });

  describe('Layer Detection', () => {
    it('should detect API layer', () => {
      const task = createTask(
        'Create REST endpoint',
        'Build a new API route with request validation and response handling'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.layer).toBe('api');
    });

    it('should detect UI layer', () => {
      const task = createTask(
        'Design login form',
        'Create a modal component with form inputs and submit button'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.layer).toBe('ui');
    });

    it('should detect database layer', () => {
      const task = createTask(
        'Add new table',
        'Create database migration with new schema table and indexes'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.layer).toBe('database');
    });

    it('should detect business logic layer', () => {
      const task = createTask(
        'Implement validation rules',
        'Add service layer logic for data validation and business rule processing'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.layer).toBe('business_logic');
    });
  });

  describe('Skill Detection', () => {
    it('should detect TypeScript skill', () => {
      const task = createTask(
        'Add TypeScript types',
        'Define TypeScript interfaces and type definitions for the API'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.skills).toContain('typescript');
    });

    it('should detect React skill', () => {
      const task = createTask(
        'Build React component',
        'Create a new React component using hooks and JSX'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.skills).toContain('react');
    });

    it('should detect multiple skills', () => {
      const task = createTask(
        'Full-stack feature',
        'Build NextJS API route with Prisma database access and React UI with TypeScript'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.skills.length).toBeGreaterThan(1);
      expect(analysis.skills).toContain('typescript');
      expect(analysis.skills).toContain('react');
      expect(analysis.skills).toContain('nextjs');
      expect(analysis.skills).toContain('database');
    });

    it('should detect authentication skill', () => {
      const task = createTask(
        'Add OAuth',
        'Implement OAuth authentication with JWT tokens'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.skills).toContain('auth');
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign high confidence for clear backend tasks', () => {
      const task = createTask(
        'Create REST API endpoint',
        'Build a new API route with database migration, authentication middleware, and TypeScript types'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.confidence).toBeGreaterThan(0.6);
    });

    it('should assign high confidence for clear frontend tasks', () => {
      const task = createTask(
        'Build user interface',
        'Create responsive React component with TailwindCSS, form inputs, and modal design'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.confidence).toBeGreaterThan(0.6);
    });

    it('should assign lower confidence for vague tasks', () => {
      const task = createTask(
        'Do something',
        'Work on the project'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.confidence).toBeLessThan(0.5);
    });

    it('should always return confidence between 0 and 1', () => {
      const tasks = [
        createTask('API', 'backend database api endpoint'),
        createTask('UI', 'frontend component react'),
        createTask('Test', 'vague task'),
        createTask('', '')
      ];

      for (const task of tasks) {
        const analysis = analyzer.analyze(task);
        expect(analysis.confidence).toBeGreaterThanOrEqual(0);
        expect(analysis.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Acceptance Criteria', () => {
    it('should suggest backend-worker with >60% confidence for backend tasks', () => {
      const task = createTask(
        'Implement REST API',
        'Create backend API endpoint with database schema and authentication'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('backend');
      expect(analysis.confidence).toBeGreaterThan(0.6);
    });

    it('should suggest frontend worker with >60% confidence for UI tasks', () => {
      const task = createTask(
        'Create user dashboard',
        'Build frontend UI component with React, forms, buttons, and responsive design'
      );

      const analysis = analyzer.analyze(task);

      expect(analysis.domain).toBe('frontend');
      expect(analysis.confidence).toBeGreaterThan(0.6);
    });
  });
});
