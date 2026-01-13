export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  defaultPrompt: string;
  variables: string[];
}

export const DEFAULT_PROMPTS: Record<string, PromptTemplate> = {
  prdGeneration: {
    id: "prdGeneration",
    name: "PRD Generation",
    description: "Generates a Product Requirements Document with user stories from an idea",
    variables: ["{{projectName}}", "{{idea}}"],
    defaultPrompt: `You are a product manager. Generate a PRD (Product Requirements Document) for the following app idea.

PROJECT NAME: {{projectName}}

IDEA:
{{idea}}

Generate a prd.json file in the .ideate/ folder with the following structure:
{
  "project": "{{projectName}}",
  "description": "Brief project description",
  "branchName": "main",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "Detailed description of the user story",
      "acceptanceCriteria": ["AC1", "AC2", "AC3"],
      "priority": 1,
      "passes": false,
      "status": "pending",
      "notes": ""
    }
  ]
}

Requirements:
1. Create 5-10 user stories that cover the core functionality
2. Order stories by priority (1 = highest priority)
3. Each story should have 3-5 clear acceptance criteria
4. Stories should be small enough to implement in a single iteration
5. Include foundational setup stories first (project init, basic structure)
6. Write the prd.json to .ideate/prd.json

IMPORTANT: Only create the prd.json file. Do not implement any features.`,
  },

  prdFromCodebase: {
    id: "prdFromCodebase",
    name: "PRD from Existing Codebase",
    description: "Analyzes an existing codebase and generates a PRD that could recreate it",
    variables: ["{{projectName}}"],
    defaultPrompt: `You are a product manager and software architect. Analyze the existing codebase in this project directory and generate a comprehensive PRD (Product Requirements Document) that accurately describes what the project does and how it could be recreated.

PROJECT NAME: {{projectName}}

INSTRUCTIONS:
1. First, explore the project structure to understand the codebase:
   - Look at package.json, Cargo.toml, go.mod, or similar files to understand dependencies
   - Examine the source directory structure
   - Read key entry point files (main.ts, index.js, main.rs, etc.)
   - Review any existing documentation (README, docs/)
   - Check configuration files

2. Identify the core features and functionality:
   - What does this application do?
   - What are the main user-facing features?
   - What are the key components/modules?
   - What external services or APIs does it integrate with?

3. Generate user stories that would recreate this project from scratch:
   - Start with project setup and infrastructure stories
   - Group related features into logical stories
   - Ensure stories are ordered by dependency (foundational first)
   - Mark all stories as passes: true since the code already exists

4. Create a prd.json file in .ideate/ with this structure:
{
  "project": "{{projectName}}",
  "description": "Extracted description of what the project does",
  "branchName": "main",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "Detailed description of what this story implements",
      "acceptanceCriteria": ["AC1", "AC2", "AC3"],
      "priority": 1,
      "passes": true,
      "status": "complete",
      "notes": "Relevant implementation notes from the existing code"
    }
  ]
}

Requirements:
1. Create 8-15 user stories covering all major functionality
2. Stories should reflect the actual architecture and features found
3. Include infrastructure/setup stories (project init, database setup, auth, etc.)
4. Include feature-specific stories for each major capability
5. Add notes to stories referencing key files or implementation details
6. Mark all passes: true and status: "complete" since code exists
7. Write the prd.json to .ideate/prd.json

IMPORTANT: Only analyze and create the prd.json file. Do not modify any existing code.`,
  },

  additionalStories: {
    id: "additionalStories",
    name: "Generate Additional Stories",
    description: "Generates additional user stories based on a request",
    variables: ["{{projectName}}", "{{existingStories}}", "{{request}}", "{{nextPriority}}"],
    defaultPrompt: `You are a product manager. Based on the user's request, generate additional user stories for an existing project.

PROJECT NAME: {{projectName}}

EXISTING USER STORIES:
{{existingStories}}

USER REQUEST:
{{request}}

Read the existing .ideate/prd.json file and ADD new user stories to it based on the user's request. Keep all existing stories intact.

Requirements for new stories:
1. Analyze the request and break it down into appropriate user stories
2. Each story should be small enough to implement in a single iteration
3. Start new story IDs after the existing ones (use format US-XXX where XXX continues from existing)
4. Set priorities starting from {{nextPriority}} (higher number = lower priority)
5. Each story should have 3-5 clear acceptance criteria
6. Set passes: false and status: "pending" for all new stories
7. Consider dependencies - foundational changes should have lower priority numbers
8. Add helpful implementation notes where appropriate

Update the .ideate/prd.json file by appending the new stories to the existing userStories array.

IMPORTANT: 
- Do NOT remove or modify existing stories
- Only ADD new stories to the userStories array
- Do NOT implement any features, only update the prd.json`,
  },

  storyImplementation: {
    id: "storyImplementation",
    name: "Story Implementation",
    description: "Implements a user story following its acceptance criteria",
    variables: ["{{storyId}}", "{{storyTitle}}", "{{storyDescription}}", "{{acceptanceCriteria}}", "{{notes}}"],
    defaultPrompt: `Implement the following user story:

## {{storyId}}: {{storyTitle}}

{{storyDescription}}

### Acceptance Criteria:
{{acceptanceCriteria}}

{{notes}}

Please implement this user story following the acceptance criteria. When done, ensure all quality checks pass (typecheck, lint, build).`,
  },

  devServerDetection: {
    id: "devServerDetection",
    name: "Dev Server Detection",
    description: "Detects how to start the development server for preview",
    variables: [],
    defaultPrompt: `Look at this project and tell me how to start the development server for preview. 
Respond with ONLY a JSON object in this exact format, no other text:
{"command": "the full command to run", "url": "http://localhost:PORT"}

For example:
{"command": "npm run dev", "url": "http://localhost:5173"}
{"command": "pnpm dev", "url": "http://localhost:3000"}

Check package.json for the dev/start script and the framework being used to determine the correct port.`,
  },

  ideaDescriptionGenerate: {
    id: "ideaDescriptionGenerate",
    name: "Generate Idea Description",
    description: "Generates a detailed description for an idea from its title and summary",
    variables: ["{{title}}", "{{summary}}"],
    defaultPrompt: `Generate a detailed description for the following idea. Write in Markdown format with appropriate headers, bullet points, and formatting.

IDEA TITLE: {{title}}

SUMMARY: {{summary}}

Write a comprehensive description that:
1. Expands on the core concept
2. Identifies key features or components
3. Describes the target audience or use case
4. Notes any technical considerations
5. Suggests potential challenges and solutions

Output ONLY the description content in Markdown format. Do not include any preamble or explanation - just the description itself.`,
  },

  ideaDescriptionShorten: {
    id: "ideaDescriptionShorten",
    name: "Shorten Idea Description",
    description: "Makes an idea description more concise while preserving key points",
    variables: ["{{description}}"],
    defaultPrompt: `Shorten the following description while preserving the key points. Make it more concise and scannable. Keep the Markdown formatting.

CURRENT DESCRIPTION:
{{description}}

Output ONLY the shortened description in Markdown format. Do not include any preamble or explanation - just the shortened description itself.`,
  },

  ideaDescriptionLengthen: {
    id: "ideaDescriptionLengthen",
    name: "Lengthen Idea Description",
    description: "Expands an idea description with more detail and context",
    variables: ["{{title}}", "{{summary}}", "{{description}}"],
    defaultPrompt: `Expand the following description with more detail, examples, and context. Keep the Markdown formatting and enhance it with better structure.

IDEA TITLE: {{title}}
SUMMARY: {{summary}}

CURRENT DESCRIPTION:
{{description}}

Add more detail about:
1. Implementation specifics
2. User benefits
3. Technical architecture considerations
4. Potential integrations
5. Success metrics

Output ONLY the expanded description in Markdown format. Do not include any preamble or explanation - just the expanded description itself.`,
  },

  ideaDescriptionSimplify: {
    id: "ideaDescriptionSimplify",
    name: "Simplify Idea Description",
    description: "Rewrites an idea description to be easier to read",
    variables: ["{{description}}"],
    defaultPrompt: `Rewrite the following description to be easier to read. Use simpler language, shorter sentences, and clearer structure. Keep the Markdown formatting.

CURRENT DESCRIPTION:
{{description}}

Make it:
1. Use plain language (avoid jargon)
2. Break up long paragraphs
3. Use bullet points for lists
4. Add clear headers for sections
5. Be accessible to non-technical readers

Output ONLY the simplified description in Markdown format. Do not include any preamble or explanation - just the simplified description itself.`,
  },

  prdFromIdea: {
    id: "prdFromIdea",
    name: "PRD from Detailed Idea",
    description: "Generates a comprehensive PRD with 8-15 user stories from a detailed idea with title, summary, and description",
    variables: ["{{projectName}}", "{{title}}", "{{summary}}", "{{description}}"],
    defaultPrompt: `You are an experienced product manager. Generate a comprehensive PRD (Product Requirements Document) for the following detailed idea.

PROJECT NAME: {{projectName}}

IDEA TITLE: {{title}}

SUMMARY: {{summary}}

DETAILED DESCRIPTION:
{{description}}

Generate a prd.json file in the .ideate/ folder with the following structure:
{
  "project": "{{projectName}}",
  "description": "Brief project description based on the idea",
  "branchName": "main",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "Detailed description of the user story",
      "acceptanceCriteria": ["AC1", "AC2", "AC3"],
      "priority": 1,
      "passes": false,
      "status": "pending",
      "notes": ""
    }
  ]
}

CRITICAL REQUIREMENTS:

1. STORY COUNT: Generate 8-15 user stories that comprehensively cover the idea
   - If the idea is complex, lean toward 15 stories
   - If simpler, 8-10 stories may suffice

2. STORY SIZING: Each story MUST be completable in a single iteration
   - If a feature is too large, break it into multiple smaller stories
   - Each story should be independently testable
   - Avoid stories that bundle multiple unrelated features

3. PRIORITIZATION: Order stories by implementation dependency and importance
   - Priority 1-3: Project setup, core infrastructure, foundational components
   - Priority 4-8: Core features that deliver primary value
   - Priority 9-12: Secondary features and enhancements
   - Priority 13+: Nice-to-haves, polish, and optimizations

4. STORY STRUCTURE:
   - Clear, action-oriented title
   - Detailed description explaining the what and why
   - 3-5 specific, testable acceptance criteria
   - Implementation notes where helpful

5. COMPLEXITY HANDLING:
   - For complex features mentioned in the description, break them into multiple stories
   - Consider setup/infrastructure stories separately from feature stories
   - Include integration and testing stories where appropriate

6. COVERAGE: Ensure stories cover:
   - Project initialization and setup
   - Core data models and structures
   - Primary user-facing features
   - UI/UX components
   - Error handling and edge cases
   - Any integrations mentioned

Write the prd.json to .ideate/prd.json

IMPORTANT: Only create the prd.json file. Do not implement any features.`,
  },

  storyBreakdown: {
    id: "storyBreakdown",
    name: "Story Breakdown",
    description: "Evaluates each user story and breaks down complex ones into smaller, single-iteration stories",
    variables: ["{{projectName}}"],
    defaultPrompt: `You are an experienced product manager and agile coach. Your task is to review the existing PRD and break down any user stories that are too complex to complete in a single iteration.

PROJECT NAME: {{projectName}}

INSTRUCTIONS:

1. Read the existing .ideate/prd.json file

2. For EACH user story, evaluate:
   - Can this story be completed by a single developer in 1-3 days?
   - Does it have a single, focused objective?
   - Are the acceptance criteria all related to one cohesive feature?
   - Could it be implemented without touching too many different parts of the system?

3. If a story is TOO COMPLEX, break it down:
   - Split into 2-5 smaller stories that together accomplish the original goal
   - Each sub-story should be independently valuable and testable
   - Maintain logical dependency order in priorities
   - Use IDs like US-001a, US-001b, etc. for breakdowns of US-001
   - Or use the next available sequential IDs (US-016, US-017, etc.)

4. Signs a story needs breakdown:
   - More than 5 acceptance criteria
   - Mentions multiple distinct features or screens
   - Requires changes across many layers (DB, API, UI, etc.)
   - Contains words like "and also", "as well as", "including"
   - Would take more than a few days to implement
   - Has vague or broad scope

5. Keep stories that are already well-sized:
   - Focused on one specific capability
   - 3-5 clear acceptance criteria
   - Can be demoed independently
   - Reasonable implementation scope

6. Re-prioritize after breakdown:
   - Ensure dependencies are reflected in priority order
   - Foundation/setup stories come first
   - Related sub-stories should be grouped in priority

7. Update the .ideate/prd.json file with:
   - All original stories that were fine as-is
   - Broken-down stories replacing complex ones
   - Updated priorities reflecting the new order
   - Notes explaining any breakdowns made

The goal is to have a PRD where EVERY story can realistically be completed in a single focused iteration. It's perfectly fine to end up with 50, 100, or even more stories if the project warrants it.

IMPORTANT: 
- Update the .ideate/prd.json file in place
- Preserve all metadata (project, description, branchName)
- Do NOT implement any features, only refine the PRD`,
  },
};

export type PromptOverrides = Record<string, string>;

export function getPrompt(promptId: keyof typeof DEFAULT_PROMPTS, overrides?: PromptOverrides): string {
  const template = DEFAULT_PROMPTS[promptId];
  if (!template) {
    throw new Error(`Unknown prompt: ${promptId}`);
  }
  
  if (overrides && overrides[promptId]) {
    return overrides[promptId];
  }
  
  return template.defaultPrompt;
}

export function applyVariables(prompt: string, variables: Record<string, string>): string {
  let result = prompt;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}
