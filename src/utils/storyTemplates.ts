export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  titleTemplate: string;
  descriptionTemplate: string;
  acceptanceCriteria: string[];
}

export const storyTemplates: StoryTemplate[] = [
  {
    id: "api-endpoint",
    name: "API Endpoint",
    description: "CRUD operations, validation, error handling",
    titleTemplate: "Implement {name} API endpoint",
    descriptionTemplate:
      "As a developer, I want to create the {name} API endpoint so that clients can interact with this resource.",
    acceptanceCriteria: [
      "Endpoint accepts valid request payloads and returns appropriate responses",
      "Input validation returns 400 status with descriptive error messages for invalid data",
      "Authentication/authorization is enforced (401/403 for unauthorized requests)",
      "Proper error handling returns appropriate HTTP status codes (404, 500, etc.)",
      "Response follows consistent API format with proper content-type headers",
      "Rate limiting is applied if applicable",
      "API documentation is updated with endpoint details",
    ],
  },
  {
    id: "react-component",
    name: "React Component",
    description: "Props, states, events, styling",
    titleTemplate: "Create {name} component",
    descriptionTemplate:
      "As a user, I want the {name} component so that I can interact with this part of the interface.",
    acceptanceCriteria: [
      "Component renders correctly with all required props",
      "Component handles loading, error, and empty states appropriately",
      "Interactive elements respond to user events (click, hover, focus)",
      "Component is accessible (proper ARIA attributes, keyboard navigation)",
      "Styling matches design specifications and is responsive",
      "Component is properly typed with TypeScript interfaces",
      "Unit tests cover primary functionality and edge cases",
    ],
  },
  {
    id: "database-model",
    name: "Database Model",
    description: "Schema, migrations, relationships",
    titleTemplate: "Create {name} database model",
    descriptionTemplate:
      "As a developer, I want to define the {name} database model so that we can persist and query this data.",
    acceptanceCriteria: [
      "Schema defines all required fields with appropriate types and constraints",
      "Migration script creates/modifies tables safely (up and down)",
      "Indexes are defined for frequently queried fields",
      "Foreign key relationships are properly defined with cascade rules",
      "Model includes timestamps (created_at, updated_at) if applicable",
      "Validation rules are defined at the model level",
      "Seed data is provided for development/testing",
    ],
  },
  {
    id: "authentication",
    name: "Authentication",
    description: "Login, logout, session management",
    titleTemplate: "Implement {name} authentication",
    descriptionTemplate:
      "As a user, I want to authenticate via {name} so that I can securely access protected features.",
    acceptanceCriteria: [
      "User can successfully log in with valid credentials",
      "Invalid credentials return appropriate error message without leaking info",
      "Session/token is securely stored and managed",
      "User can log out and session is properly invalidated",
      "Session expiration is handled gracefully with re-authentication flow",
      "Protected routes redirect unauthenticated users to login",
      "Password reset/recovery flow works if applicable",
      "Rate limiting prevents brute force attacks",
    ],
  },
  {
    id: "form-input",
    name: "Form/Input",
    description: "Validation, submission, error states",
    titleTemplate: "Create {name} form",
    descriptionTemplate:
      "As a user, I want to fill out the {name} form so that I can submit this information.",
    acceptanceCriteria: [
      "All required fields are marked and validated before submission",
      "Real-time validation provides immediate feedback on field blur",
      "Error messages are clear, specific, and positioned near the relevant field",
      "Form prevents duplicate submissions (loading state, button disabled)",
      "Successful submission shows confirmation and clears/redirects appropriately",
      "Form data is preserved if user navigates away and returns",
      "Form is accessible (labels, error announcements, keyboard navigation)",
      "Mobile-friendly input types and layouts",
    ],
  },
  {
    id: "test-suite",
    name: "Test Suite",
    description: "Unit tests, integration tests",
    titleTemplate: "Add tests for {name}",
    descriptionTemplate:
      "As a developer, I want comprehensive tests for {name} so that we can catch regressions early.",
    acceptanceCriteria: [
      "Unit tests cover all public methods/functions",
      "Edge cases and boundary conditions are tested",
      "Error handling paths are tested",
      "Mocks/stubs are used appropriately for external dependencies",
      "Integration tests verify component interactions",
      "Test coverage meets project minimum threshold",
      "Tests are deterministic and do not have race conditions",
      "Test descriptions clearly explain what is being tested",
    ],
  },
  {
    id: "bug-fix",
    name: "Bug Fix",
    description: "Reproduction, root cause, fix, verification",
    titleTemplate: "Fix: {name}",
    descriptionTemplate:
      "As a user, I expect {name} to work correctly, but currently it is not functioning as expected.",
    acceptanceCriteria: [
      "Bug can be reproduced with documented steps",
      "Root cause is identified and documented",
      "Fix addresses the root cause without introducing side effects",
      "Regression test is added to prevent future occurrences",
      "Fix is verified in the original reproduction scenario",
      "Related edge cases are tested",
      "No existing tests are broken by the fix",
    ],
  },
  {
    id: "refactoring",
    name: "Refactoring",
    description: "Before/after, no behavior change",
    titleTemplate: "Refactor {name}",
    descriptionTemplate:
      "As a developer, I want to refactor {name} to improve code quality without changing external behavior.",
    acceptanceCriteria: [
      "All existing tests pass after refactoring",
      "No changes to public API or external behavior",
      "Code follows project style guide and best practices",
      "Improved readability/maintainability documented in PR description",
      "Performance is not degraded (benchmark if applicable)",
      "Dead code is removed",
      "Documentation is updated if internal structure changes significantly",
    ],
  },
];

export function getTemplateById(id: string): StoryTemplate | undefined {
  return storyTemplates.find((t) => t.id === id);
}

export function applyTemplatePlaceholders(
  template: string,
  placeholders: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}
