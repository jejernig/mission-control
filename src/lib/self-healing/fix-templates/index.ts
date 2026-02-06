export * from './base';
export { VerificationGateTemplate } from './verification-gate';
export { ClarificationTemplate } from './clarification';
export { ReassignmentTemplate } from './reassignment';

import { FixTemplate } from './base';
import { VerificationGateTemplate } from './verification-gate';
import { ClarificationTemplate } from './clarification';
import { ReassignmentTemplate } from './reassignment';

export const FIX_TEMPLATES: FixTemplate[] = [
  new VerificationGateTemplate(),
  new ClarificationTemplate(),
  new ReassignmentTemplate()
];

export function getTemplateByCategory(category: string): FixTemplate | undefined {
  return FIX_TEMPLATES.find(t => t.category === category);
}

export function getAllCategories(): string[] {
  return FIX_TEMPLATES.map(t => t.category);
}
