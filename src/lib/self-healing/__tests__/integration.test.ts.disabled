/**
 * Self-Healing Integration Tests
 * Tests the complete end-to-end workflow
 */

import { DetectionService } from '../detection';
import { RCAService } from '../rca';
import { FixGeneratorService } from '../fix-generator';
import { db } from '../../db';
import type { Task } from '../../types';

// Mock the database
jest.mock('../../db');

describe('Self-Healing Integration Tests', () => {
  let detection: DetectionService;
  let rca: RCAService;
  let fixGenerator: FixGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    detection = new DetectionService({
      phantomDetection: { enabled: true, minTimeSinceDone: 15 },
      stuckDetection: { enabled: true, timeThreshold: 4 },
      cooldownPeriod: 60,
      gracePeriod: 30,
      whitelist: ['maintenance'],
    });
    rca = new RCAService();
    fixGenerator = new FixGeneratorService();
  });

  describe('Scenario 1: Phantom Implementation Flow', () => {
    it('should detect phantom implementation when task is done with 0 commits', async () => {
      // Create test task marked as done with no commits
      const task: Task = {
        id: 'test-phantom-1',
        title: 'Implement user authentication',
        description: 'Add JWT auth to API',
        status: 'done',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
        assigned_agent_id: 'agent-1',
      };

      // Mock database responses
      (db.getDeliverables as jest.Mock).mockResolvedValue([]);
      (db.getActivities as jest.Mock).mockResolvedValue([
        {
          id: 'act-1',
          task_id: task.id,
          agent_id: 'agent-1',
          agent_name: 'Test Agent',
          action: 'Marked task as complete',
          timestamp: task.updated_at,
        },
      ]);

      // Step 1: Detection
      const detectionResult = await detection.detectIssues(task);
      
      expect(detectionResult.issueDetected).toBe(true);
      expect(detectionResult.issueType).toBe('phantom_implementation');
      expect(detectionResult.severity).toBe('high');
      expect(detectionResult.evidence.commitCount).toBe(0);
    });

    it('should perform RCA and identify worker confusion', async () => {
      const task: Task = {
        id: 'test-phantom-2',
        title: 'Fix broken API endpoint',
        description: 'Endpoint returns 500',
        status: 'done',
        priority: 'high',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-1',
      };

      const detectionResult = {
        issueDetected: true,
        issueType: 'phantom_implementation' as const,
        severity: 'high' as const,
        taskId: task.id,
        evidence: { commitCount: 0 },
      };

      (db.getDeliverables as jest.Mock).mockResolvedValue([]);
      (db.getActivities as jest.Mock).mockResolvedValue([
        {
          id: 'act-1',
          task_id: task.id,
          agent_id: 'agent-1',
          agent_name: 'Test Agent',
          action: 'Task completed',
          timestamp: task.updated_at,
        },
      ]);

      // Step 2: RCA
      const rcaResult = await rca.analyze(task, detectionResult);

      expect(rcaResult.rootCause).toBe('worker_confusion');
      expect(rcaResult.confidence).toBeGreaterThan(0.8);
      expect(rcaResult.recommendations).toContain(
        expect.stringContaining('verification gate')
      );
    });

    it('should generate fix task with verification gates', async () => {
      const task: Task = {
        id: 'test-phantom-3',
        title: 'Add search feature',
        description: 'Implement full-text search',
        status: 'done',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-1',
      };

      const rcaResult = {
        taskId: task.id,
        issueType: 'phantom_implementation',
        rootCause: 'worker_confusion',
        analysis: 'Task marked complete without implementation',
        confidence: 0.9,
        recommendations: ['Add verification gate'],
        evidence: { commitCount: 0 },
      };

      // Step 3: Fix Generation
      const fixTask = await fixGenerator.generateFix(task, rcaResult);

      expect(fixTask.title).toContain('[FIX]');
      expect(fixTask.title).toContain('Re-implement');
      expect(fixTask.description).toContain('verification gate');
      expect(fixTask.description).toContain('At least one code commit must be present');
      expect(fixTask.priority).toBe('high');
      expect(fixTask.metadata?.original_task_id).toBe(task.id);
    });

    it('should post activity to original task', async () => {
      (db.logActivity as jest.Mock).mockResolvedValue(undefined);

      const rcaResult = {
        taskId: 'task-1',
        issueType: 'phantom_implementation',
        rootCause: 'worker_confusion',
        analysis: 'Test analysis',
        confidence: 0.9,
        recommendations: [],
        evidence: {},
      };

      // Step 4: Notification
      await fixGenerator.notifyOriginalTask('task-1', 'fix-task-1', rcaResult);

      expect(db.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-1',
          agent_id: 'system',
          agent_name: 'Self-Healing System',
          action: expect.stringContaining('detected an issue'),
        })
      );
    });
  });

  describe('Scenario 2: Stuck Task Flow', () => {
    it('should detect stuck task after 4+ hours', async () => {
      const task: Task = {
        id: 'test-stuck-1',
        title: 'Refactor database layer',
        description: 'Clean up ORM queries',
        status: 'in_progress',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10 hours ago
        updated_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        assigned_agent_id: 'agent-2',
      };

      (db.getActivities as jest.Mock).mockResolvedValue([
        {
          id: 'act-1',
          task_id: task.id,
          agent_id: 'agent-2',
          agent_name: 'Backend Agent',
          action: 'Started work',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        },
      ]);

      // Step 1: Detection
      const detectionResult = await detection.detectIssues(task);

      expect(detectionResult.issueDetected).toBe(true);
      expect(detectionResult.issueType).toBe('stuck_task');
      expect(detectionResult.severity).toBe('high');
      expect(detectionResult.evidence.timeInProgress).toBeGreaterThan(4);
    });

    it('should perform RCA and identify appropriate root cause', async () => {
      const task: Task = {
        id: 'test-stuck-2',
        title: 'Integrate payment gateway',
        description: 'Add Stripe integration',
        status: 'in_progress',
        priority: 'high',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-2',
      };

      const detectionResult = {
        issueDetected: true,
        issueType: 'stuck_task' as const,
        severity: 'high' as const,
        taskId: task.id,
        evidence: { timeInProgress: 8 },
      };

      (db.getDeliverables as jest.Mock).mockResolvedValue([]);
      (db.getActivities as jest.Mock).mockResolvedValue([
        {
          id: 'act-1',
          task_id: task.id,
          agent_id: 'agent-2',
          agent_name: 'Backend Agent',
          action: 'Question: What are the API credentials?',
          timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
        },
      ]);

      // Step 2: RCA
      const rcaResult = await rca.analyze(task, detectionResult);

      expect(rcaResult.rootCause).toBe('requirements_unclear');
      expect(rcaResult.confidence).toBeGreaterThan(0.7);
      expect(rcaResult.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate appropriate fix task', async () => {
      const task: Task = {
        id: 'test-stuck-3',
        title: 'Optimize database queries',
        description: 'Improve performance',
        status: 'in_progress',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-2',
      };

      const rcaResult = {
        taskId: task.id,
        issueType: 'stuck_task',
        rootCause: 'requirements_unclear',
        analysis: 'Task blocked by unanswered questions',
        confidence: 0.8,
        recommendations: ['Answer pending questions'],
        evidence: { timeInProgress: 8 },
      };

      // Step 3: Fix Generation
      const fixTask = await fixGenerator.generateFix(task, rcaResult);

      expect(fixTask.title).toContain('[FIX]');
      expect(fixTask.title).toContain('Clarify');
      expect(fixTask.description).toContain('requirements');
      expect(fixTask.priority).toBe('high');
    });
  });

  describe('Scenario 3: False Positive Prevention', () => {
    it('should not re-detect issue during cooldown period', async () => {
      const task: Task = {
        id: 'test-cooldown-1',
        title: 'Test task',
        description: 'Test',
        status: 'done',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-1',
      };

      (db.getDeliverables as jest.Mock).mockResolvedValue([]);
      (db.getActivities as jest.Mock).mockResolvedValue([]);

      // First detection
      const result1 = await detection.detectIssues(task);
      expect(result1.issueDetected).toBe(true);

      // Second detection (should be blocked by cooldown)
      const result2 = await detection.detectIssues(task);
      expect(result2.issueDetected).toBe(false);
    });

    it('should ignore whitelisted maintenance tasks', async () => {
      const task: Task = {
        id: 'test-whitelist-1',
        title: '[MAINTENANCE] Database backup',
        description: 'Weekly backup',
        status: 'done',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-1',
      };

      (db.getDeliverables as jest.Mock).mockResolvedValue([]);
      (db.getActivities as jest.Mock).mockResolvedValue([]);

      const result = await detection.detectIssues(task);
      expect(result.issueDetected).toBe(false);
    });

    it('should not flag newly created tasks (grace period)', async () => {
      const task: Task = {
        id: 'test-grace-1',
        title: 'New task',
        description: 'Just created',
        status: 'in_progress',
        priority: 'normal',
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        assigned_agent_id: 'agent-1',
      };

      (db.getActivities as jest.Mock).mockResolvedValue([]);

      const result = await detection.detectIssues(task);
      expect(result.issueDetected).toBe(false);
    });
  });
});
