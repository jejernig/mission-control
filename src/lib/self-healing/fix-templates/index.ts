/**
 * Fix Templates Index
 * 
 * Exports all available fix templates and provides a registry for easy access.
 */

export * from './base';
export { VerificationGateTemplate } from './verification-gate';
export { ClarificationTemplate } from './clarification';
export { ReassignmentTemplate } from './reassignment';

import { FixTemplate } from './base';
import { VerificationGateTemplate } from './verification-gate';
import { ClarificationTemplate } from './clarification';
import { ReassignmentTemplate } from './reassignment';

/**
 * Registry of all available fix templates
 */
export const FIX_TEMPLATES: FixTemplate[] = [
  new VerificationGateTemplate(),
  new ClarificationTemplate(),
  new ReassignmentTemplate()
];

/**
 * Get a fix template by category
 */
export function getTemplateByCategory(category: string): FixTemplate | undefined {
  return FIX_TEMPLATES.find(t => t.category === category);
}

/**
 * Get all template categories
 */
export function getAllCategories(): string[] {
  return FIX_TEMPLATES.map(t => t.category);
}
