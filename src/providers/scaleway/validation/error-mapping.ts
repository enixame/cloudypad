/**
 * Dev-friendly error mapping for Scaleway validation errors
 * Transforms technical Zod errors into actionable user messages
 */

import { ZodError, ZodIssue } from 'zod'

export interface FriendlyError {
  field: string;
  message: string;
  suggestion?: string;
  receivedValue?: unknown;
}

/**
 * Transforms ZodError into actionable messages with suggestions
 */
export function mapValidationError(error: ZodError): FriendlyError[] {
  return error.issues.map(mapSingleIssue);
}

function mapSingleIssue(issue: ZodIssue): FriendlyError {
  const field = issue.path.join('.');
  
  switch (issue.code) {
    case 'invalid_string':
      if ('validation' in issue && issue.validation === 'regex') {
        return mapRegexError(field, issue as ZodIssue & { validation: 'regex' });
      }
      break;
      
    case 'invalid_type':
      return {
        field,
        message: `Expected ${issue.expected}, received ${issue.received}`,
        suggestion: getTypeSuggestion(field, issue.expected),
        receivedValue: issue.received,
      };
      
    case 'custom':
      return mapCustomError(field, issue);
      
    default:
      return {
        field,
        message: issue.message,
        receivedValue: 'received' in issue ? issue.received : undefined,
      };
  }
  
  return {
    field,
    message: issue.message,
  };
}

function mapRegexError(field: string, issue: ZodIssue & { validation: 'regex' }): FriendlyError {
  const value = 'received' in issue ? issue.received : 'unknown';
  
  switch (field) {
    case 'region':
      return {
        field,
        message: `Invalid region format: "${value}"`,
        suggestion: 'Use format: "fr-par", "nl-ams", "pl-waw" (lowercase, 2-letter country + 3-letter city)',
        receivedValue: value,
      };
      
    case 'zone':
      return {
        field,
        message: `Invalid zone format: "${value}"`,
        suggestion: 'Use format: "fr-par-1", "nl-ams-2" (region + dash + number)',
        receivedValue: value,
      };
      
    case 'projectId':
      return {
        field,
        message: `Invalid project ID format: "${value}"`,
        suggestion: 'Project ID must be a valid UUID (e.g., "12345678-1234-1234-1234-123456789abc")',
        receivedValue: value,
      };
      
    default:
      return {
        field,
        message: `Invalid format for ${field}: "${value}"`,
        receivedValue: value,
      };
  }
}

function mapCustomError(field: string, issue: ZodIssue & { code: 'custom' }): FriendlyError {
  // Handle zone-region consistency errors
  if (issue.message.includes("does not belong to region")) {
    const match = issue.message.match(/Zone (\S+) does not belong to region (\S+) \(expected (\S+)\)/);
    if (match) {
      const [, zone, providedRegion, expectedRegion] = match;
      return {
        field,
        message: `Zone ${zone} belongs to region ${expectedRegion}, not ${providedRegion}`,
        suggestion: `Try: --region ${expectedRegion} (deduced from --zone ${zone})`,
        receivedValue: providedRegion,
      };
    }
  }
  
  return {
    field,
    message: issue.message,
  };
}

function getTypeSuggestion(field: string, expected: string): string | undefined {
  switch (field) {
    case 'projectId':
      return 'Provide a valid UUID string for the Scaleway project';
    case 'zone':
      return 'Provide a zone like "fr-par-1", "nl-ams-2"';
    case 'region':
      return 'Provide a region like "fr-par", "nl-ams"';
    default:
      return `Provide a valid ${expected} for ${field}`;
  }
}

/**
 * Formats friendly errors for CLI output
 */
export function formatErrorsForCLI(errors: FriendlyError[]): string {
  const lines: string[] = ['❌ Validation errors:'];
  
  for (const error of errors) {
    lines.push(`  • ${error.field}: ${error.message}`);
    if (error.suggestion) {
      lines.push(`    💡 ${error.suggestion}`);
    }
  }
  
  return lines.join('\n');
}