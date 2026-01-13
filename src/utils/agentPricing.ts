// Agent pricing configuration for cost estimation
// Prices are in USD per 1M tokens

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

export interface SubscriptionTier {
  name: string;
  monthlyPrice: number;
  annualPrice?: number; // Per year
  description: string;
  limits?: string;
}

export interface AgentPricingConfig {
  id: string;
  name: string;
  pricingModel: 'credits' | 'subscription' | 'api' | 'free';
  subscriptionTiers?: SubscriptionTier[];
  modelPricing?: Record<string, ModelPricing>;
  defaultModel?: string;
  creditsToUsd?: number; // Conversion rate for credits-based pricing
  dataPath?: string; // Where usage data is stored locally
  hasLocalData: boolean;
}

// Anthropic API pricing (as of 2024)
const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  'claude-3-5-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00, cachedInputPer1M: 0.30 },
  'claude-sonnet-4': { inputPer1M: 3.00, outputPer1M: 15.00, cachedInputPer1M: 0.30 },
  'claude-3-5-haiku': { inputPer1M: 0.80, outputPer1M: 4.00, cachedInputPer1M: 0.08 },
  'claude-3-opus': { inputPer1M: 15.00, outputPer1M: 75.00, cachedInputPer1M: 1.50 },
  'claude-opus-4': { inputPer1M: 15.00, outputPer1M: 75.00, cachedInputPer1M: 1.50 },
  'claude-opus-4-5': { inputPer1M: 15.00, outputPer1M: 75.00, cachedInputPer1M: 1.50 },
};

// OpenAI API pricing (as of 2024)
const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00, cachedInputPer1M: 1.25 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60, cachedInputPer1M: 0.075 },
  'gpt-4-turbo': { inputPer1M: 10.00, outputPer1M: 30.00 },
  'o1': { inputPer1M: 15.00, outputPer1M: 60.00, cachedInputPer1M: 7.50 },
  'o1-mini': { inputPer1M: 1.10, outputPer1M: 4.40, cachedInputPer1M: 0.55 },
  'o3-mini': { inputPer1M: 1.10, outputPer1M: 4.40, cachedInputPer1M: 0.55 },
};

export const AGENT_PRICING: AgentPricingConfig[] = [
  {
    id: 'amp',
    name: 'Amp',
    pricingModel: 'credits',
    creditsToUsd: 0.01, // Approximate: 1 credit ≈ $0.01
    subscriptionTiers: [
      {
        name: 'Pro',
        monthlyPrice: 19,
        annualPrice: 190,
        description: '500 credits/month included',
        limits: '500 credits/month',
      },
      {
        name: 'Pro+',
        monthlyPrice: 39,
        annualPrice: 390,
        description: '1500 credits/month included',
        limits: '1500 credits/month',
      },
      {
        name: 'Enterprise',
        monthlyPrice: 59,
        annualPrice: 590,
        description: 'Unlimited credits',
        limits: 'Unlimited',
      },
    ],
    dataPath: '~/.local/share/amp/threads/',
    hasLocalData: true,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    pricingModel: 'subscription',
    subscriptionTiers: [
      {
        name: 'Pro',
        monthlyPrice: 20,
        annualPrice: 200,
        description: 'Standard usage limits',
        limits: '~45 messages/5 hours (Sonnet)',
      },
      {
        name: 'Max (5x)',
        monthlyPrice: 100,
        annualPrice: 1000,
        description: '5x Pro usage limits',
        limits: '~225 messages/5 hours (Sonnet)',
      },
      {
        name: 'Max (20x)',
        monthlyPrice: 200,
        annualPrice: 2000,
        description: '20x Pro usage limits',
        limits: '~900 messages/5 hours (Sonnet)',
      },
    ],
    modelPricing: ANTHROPIC_PRICING,
    defaultModel: 'claude-sonnet-4',
    dataPath: '~/.claude/projects/',
    hasLocalData: true,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    pricingModel: 'api',
    modelPricing: { ...ANTHROPIC_PRICING, ...OPENAI_PRICING },
    defaultModel: 'claude-sonnet-4',
    dataPath: '~/.local/share/opencode/',
    hasLocalData: false, // Limited local data
  },
  {
    id: 'cursor',
    name: 'Cursor',
    pricingModel: 'subscription',
    subscriptionTiers: [
      {
        name: 'Pro',
        monthlyPrice: 20,
        annualPrice: 192,
        description: '500 fast requests/month',
        limits: '500 fast requests + unlimited slow',
      },
      {
        name: 'Business',
        monthlyPrice: 40,
        annualPrice: 384,
        description: 'Team features + more requests',
        limits: 'Enhanced limits',
      },
    ],
    modelPricing: { ...ANTHROPIC_PRICING, ...OPENAI_PRICING },
    defaultModel: 'claude-sonnet-4',
    hasLocalData: false,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    pricingModel: 'subscription',
    subscriptionTiers: [
      {
        name: 'Pro',
        monthlyPrice: 15,
        annualPrice: 120,
        description: 'Standard coding assistance',
        limits: 'Standard limits',
      },
      {
        name: 'Pro Ultimate',
        monthlyPrice: 60,
        annualPrice: 600,
        description: 'Unlimited premium models',
        limits: 'Unlimited',
      },
    ],
    modelPricing: { ...ANTHROPIC_PRICING, ...OPENAI_PRICING },
    defaultModel: 'claude-sonnet-4',
    hasLocalData: false,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    pricingModel: 'subscription',
    subscriptionTiers: [
      {
        name: 'Individual',
        monthlyPrice: 10,
        annualPrice: 100,
        description: 'For individual developers',
        limits: 'Standard limits',
      },
      {
        name: 'Business',
        monthlyPrice: 19,
        annualPrice: 228,
        description: 'For organizations',
        limits: 'Enhanced limits + admin controls',
      },
      {
        name: 'Enterprise',
        monthlyPrice: 39,
        annualPrice: 468,
        description: 'Enterprise features',
        limits: 'Full enterprise features',
      },
    ],
    modelPricing: OPENAI_PRICING,
    defaultModel: 'gpt-4o',
    hasLocalData: false,
  },
];

export function getAgentConfig(agentId: string): AgentPricingConfig | undefined {
  return AGENT_PRICING.find(a => a.id === agentId);
}

export function estimateApiCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  cachedInputTokens?: number
): number {
  // Find pricing for this model
  const allPricing = { ...ANTHROPIC_PRICING, ...OPENAI_PRICING };
  
  // Try to match model name (handle variations)
  let pricing: ModelPricing | undefined;
  const normalizedModel = model.toLowerCase();
  
  for (const [key, value] of Object.entries(allPricing)) {
    if (normalizedModel.includes(key.replace(/-/g, '').toLowerCase()) || 
        key.toLowerCase().includes(normalizedModel.replace(/-/g, ''))) {
      pricing = value;
      break;
    }
  }
  
  // Default to Sonnet pricing if no match
  if (!pricing) {
    pricing = ANTHROPIC_PRICING['claude-sonnet-4'];
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cachedCost = cachedInputTokens && pricing.cachedInputPer1M
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0;
  
  return inputCost + outputCost + cachedCost;
}

export function creditsToUsd(credits: number, agentId: string = 'amp'): number {
  const config = getAgentConfig(agentId);
  if (config?.creditsToUsd) {
    return credits * config.creditsToUsd;
  }
  return credits * 0.01; // Default assumption
}

export function getSubscriptionMonthlyValue(
  agentId: string,
  tierName?: string
): number | undefined {
  const config = getAgentConfig(agentId);
  if (!config?.subscriptionTiers) return undefined;
  
  if (tierName) {
    const tier = config.subscriptionTiers.find(t => 
      t.name.toLowerCase() === tierName.toLowerCase()
    );
    return tier?.monthlyPrice;
  }
  
  // Return first tier (usually the basic one)
  return config.subscriptionTiers[0]?.monthlyPrice;
}

export interface UsageCostSummary {
  realCost?: number; // Actual cost (from credits or API)
  estimatedApiCost: number; // What it would cost at API rates
  subscriptionValue?: number; // Monthly subscription cost if applicable
  savingsFromSubscription?: number; // How much saved vs API rates
  pricingModel: 'credits' | 'subscription' | 'api' | 'free';
}

export function calculateUsageCostSummary(
  agentId: string,
  inputTokens: number,
  outputTokens: number,
  credits?: number,
  model?: string,
  cachedInputTokens?: number
): UsageCostSummary {
  const config = getAgentConfig(agentId);
  const pricingModel = config?.pricingModel || 'api';
  
  // Estimate what this would cost at API rates
  const estimatedApiCost = estimateApiCost(
    inputTokens,
    outputTokens,
    model || config?.defaultModel || 'claude-sonnet-4',
    cachedInputTokens
  );
  
  let realCost: number | undefined;
  let subscriptionValue: number | undefined;
  let savingsFromSubscription: number | undefined;
  
  if (pricingModel === 'credits' && credits !== undefined) {
    realCost = creditsToUsd(credits, agentId);
  } else if (pricingModel === 'subscription') {
    subscriptionValue = getSubscriptionMonthlyValue(agentId);
    if (subscriptionValue && estimatedApiCost > 0) {
      // This is what you "would have paid" at API rates
      savingsFromSubscription = Math.max(0, estimatedApiCost - subscriptionValue);
    }
  } else if (pricingModel === 'api') {
    realCost = estimatedApiCost;
  }
  
  return {
    realCost,
    estimatedApiCost,
    subscriptionValue,
    savingsFromSubscription,
    pricingModel,
  };
}
