import { useEffect, useMemo, useState } from "react";
import { useCostStore, type CostEntry, type AmpUsageEntry, type ClaudeUsageEntry } from "../stores/costStore";
import { useModalKeyboard } from "../hooks/useModalKeyboard";
import { creditsToUsd, estimateApiCost, getAgentConfig } from "../utils/agentPricing";

interface CostModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectPath: string;
  projectName: string;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatCredits(credits: number): string {
  return credits.toFixed(2);
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function computeSummary(entries: CostEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      totalCost: acc.totalCost + (entry.cost || 0),
      totalCredits: acc.totalCredits + (entry.credits || 0),
      totalInputTokens: acc.totalInputTokens + (entry.inputTokens || 0),
      totalOutputTokens: acc.totalOutputTokens + (entry.outputTokens || 0),
      totalTokens: acc.totalTokens + (entry.totalTokens || 0),
      totalDurationMs: acc.totalDurationMs + (entry.durationMs || 0),
      entryCount: acc.entryCount + 1,
    }),
    { totalCost: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, totalDurationMs: 0, entryCount: 0 }
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatProjectPath(path: string): string {
  // Convert "-Users-kevin-..." format to readable path
  return path.replace(/^-/, '/').replace(/-/g, '/').split('/').slice(-2).join('/');
}

type TabType = 'global' | 'project';
type AgentType = 'amp' | 'claude';

export function CostModal({ isOpen, onClose, projectId, projectPath, projectName }: CostModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('project');
  const [activeAgent, setActiveAgent] = useState<AgentType>('amp');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  
  const allEntries = useCostStore((state) => state.entries);
  const clearEntries = useCostStore((state) => state.clearEntries);
  const ampUsage = useCostStore((state) => state.ampUsage);
  const claudeUsage = useCostStore((state) => state.claudeUsage);
  const isLoadingAmpUsage = useCostStore((state) => state.isLoadingAmpUsage);
  const isLoadingClaudeUsage = useCostStore((state) => state.isLoadingClaudeUsage);
  const loadAllAgentUsage = useCostStore((state) => state.loadAllAgentUsage);
  const refreshAllAgentUsage = useCostStore((state) => state.refreshAllAgentUsage);
  const loadProjectCostHistory = useCostStore((state) => state.loadProjectCostHistory);

  const projectEntries = useMemo(
    () => allEntries.filter((e) => e.projectId === projectId),
    [allEntries, projectId]
  );
  
  const projectSummary = useMemo(
    () => computeSummary(projectEntries),
    [projectEntries]
  );
  
  const totalSummary = useMemo(
    () => computeSummary(allEntries),
    [allEntries]
  );

  const isLoadingGlobal = isLoadingAmpUsage || isLoadingClaudeUsage;

  // Calculate costs
  const ampCosts = useMemo(() => {
    if (!ampUsage) return null;
    const realCost = creditsToUsd(ampUsage.totalCredits, 'amp');
    const estimatedApiCost = estimateApiCost(
      ampUsage.totalInputTokens,
      ampUsage.totalOutputTokens,
      'claude-sonnet-4'
    );
    return { realCost, estimatedApiCost };
  }, [ampUsage]);

  const claudeCosts = useMemo(() => {
    if (!claudeUsage) return null;
    const estimatedApiCost = estimateApiCost(
      claudeUsage.totalInputTokens,
      claudeUsage.totalOutputTokens,
      'claude-sonnet-4'
    );
    // Claude Code is subscription-based, show subscription info
    const config = getAgentConfig('claude-code');
    const monthlyTiers = config?.subscriptionTiers || [];
    return { estimatedApiCost, monthlyTiers };
  }, [claudeUsage]);

  useEffect(() => {
    if (isOpen && !ampUsage && !claudeUsage && !isLoadingGlobal) {
      loadAllAgentUsage();
    }
  }, [isOpen, ampUsage, claudeUsage, isLoadingGlobal, loadAllAgentUsage]);

  useEffect(() => {
    if (isOpen && projectPath) {
      setIsLoadingProject(true);
      loadProjectCostHistory(projectId, projectPath).finally(() => {
        setIsLoadingProject(false);
      });
    }
  }, [isOpen, projectId, projectPath, loadProjectCostHistory]);


  useModalKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  const handleClearProject = () => {
    clearEntries(projectId, projectPath);
  };

  const handleClearAll = () => {
    clearEntries();
  };

  const handleRefreshUsage = async () => {
    await refreshAllAgentUsage();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center">
              <span className="text-accent font-medium">$</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Usage & Costs</h2>
              <p className="text-xs text-muted">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 flex-shrink-0">
          <button
            onClick={() => setActiveTab('project')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'project'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Project History
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'global'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Global Usage
          </button>
        </div>

        {activeTab === 'global' ? (
          <>
            {/* Agent Selector */}
            <div className="px-6 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveAgent('amp')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeAgent === 'amp'
                      ? 'bg-accent text-white'
                      : 'bg-background text-muted hover:text-foreground border border-border'
                  }`}
                >
                  Amp
                  {ampUsage && (
                    <span className="ml-1.5 text-xs opacity-75">
                      ({ampUsage.threadCount})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveAgent('claude')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeAgent === 'claude'
                      ? 'bg-accent text-white'
                      : 'bg-background text-muted hover:text-foreground border border-border'
                  }`}
                >
                  Claude Code
                  {claudeUsage && (
                    <span className="ml-1.5 text-xs opacity-75">
                      ({claudeUsage.sessionCount})
                    </span>
                  )}
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleRefreshUsage}
                  disabled={isLoadingGlobal}
                  className="p-1.5 rounded hover:bg-card transition-colors disabled:opacity-50"
                  title="Refresh all"
                >
                  <svg className={`w-4 h-4 text-muted ${isLoadingGlobal ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {activeAgent === 'amp' ? (
              <>
                {/* Amp Summary */}
                <div className="px-6 py-4 border-b border-border flex-shrink-0">
                  <div className="p-4 rounded-lg bg-background border border-border">
                    <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Amp Global Usage</h3>
                    {ampUsage ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Total Credits</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatCredits(ampUsage.totalCredits)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Total Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(ampUsage.totalTokens)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Input Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(ampUsage.totalInputTokens)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Output Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(ampUsage.totalOutputTokens)}
                              </span>
                            </div>
                            {ampUsage.totalDurationMs > 0 && (
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary">Total Run Time</span>
                                <span className="text-sm font-medium text-foreground">
                                  {formatDuration(ampUsage.totalDurationMs)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Cost breakdown */}
                        {ampCosts && (
                          <div className="pt-3 border-t border-border/50">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary">Cost (Credits)</span>
                                <span className="text-sm font-medium text-accent">
                                  {formatCurrency(ampCosts.realCost)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary">Est. API Cost</span>
                                <span className="text-sm font-medium text-muted" title="Estimated cost at direct API rates">
                                  {formatCurrency(ampCosts.estimatedApiCost)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isLoadingAmpUsage ? (
                      <div className="flex flex-col items-center justify-center py-6">
                        <svg className="w-6 h-6 text-accent animate-spin mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <p className="text-sm text-muted">Loading Amp usage data...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6">
                        <p className="text-sm text-muted">No Amp data found</p>
                        <p className="text-xs text-muted/70 mt-1">Amp data is stored in ~/.local/share/amp/threads/</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amp Entries List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                      Recent Thread Usage ({ampUsage?.entries.length || 0} threads)
                    </h3>
                  </div>
                  
                  {isLoadingAmpUsage ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <svg className="w-8 h-8 text-accent animate-spin mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-sm text-muted">Scanning Amp threads...</p>
                    </div>
                  ) : !ampUsage || ampUsage.entries.length === 0 ? (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 mx-auto text-muted/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-muted">No Amp usage data found</p>
                      <p className="text-xs text-muted/70 mt-1">Run Amp agents to see usage data here</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ampUsage.entries.slice(-50).reverse().map((entry: AmpUsageEntry, index: number) => (
                        <div
                          key={`${entry.threadId}-${index}`}
                          className="p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {entry.threadTitle || 'Untitled Thread'}
                                </span>
                                {entry.model && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted">
                                    {entry.model.replace('claude-', '').replace(/-\d+$/, '')}
                                  </span>
                                )}
                                {entry.stopReason && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    entry.stopReason === 'end_turn' ? 'bg-green-500/15 text-green-400' :
                                    entry.stopReason === 'tool_use' ? 'bg-blue-500/15 text-blue-400' :
                                    entry.stopReason === 'max_tokens' ? 'bg-yellow-500/15 text-yellow-400' :
                                    'bg-card text-muted'
                                  }`}>
                                    {entry.stopReason.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                <span>{formatDate(entry.timestamp)}</span>
                                <a
                                  href={`https://ampcode.com/threads/${entry.threadId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {entry.threadId.substring(0, 12)}...
                                </a>
                                <span>{formatNumber(entry.inputTokens)} in / {formatNumber(entry.outputTokens)} out</span>
                                {entry.durationMs > 0 && (
                                  <span>⏱ {formatDuration(entry.durationMs)}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-medium text-accent flex-shrink-0">
                              {formatCredits(entry.credits)} credits
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Claude Code Summary */}
                <div className="px-6 py-4 border-b border-border flex-shrink-0">
                  <div className="p-4 rounded-lg bg-background border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Claude Code Global Usage</h3>
                      {claudeUsage?.detectedTier && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                          {claudeUsage.detectedTier}
                        </span>
                      )}
                    </div>
                    {claudeUsage ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Sessions</span>
                              <span className="text-sm font-medium text-foreground">
                                {claudeUsage.sessionCount}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Total Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(claudeUsage.totalTokens)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Input Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(claudeUsage.totalInputTokens)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary">Output Tokens</span>
                              <span className="text-sm font-medium text-foreground">
                                {formatNumber(claudeUsage.totalOutputTokens)}
                              </span>
                            </div>
                            {claudeUsage.totalDurationMs > 0 && (
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary">Total Run Time</span>
                                <span className="text-sm font-medium text-foreground">
                                  {formatDuration(claudeUsage.totalDurationMs)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Cost breakdown for subscription-based service */}
                        {claudeCosts && (
                          <div className="pt-3 border-t border-border/50">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary">Est. API Cost</span>
                                <span className="text-sm font-medium text-accent" title="Estimated cost at direct API rates">
                                  {formatCurrency(claudeCosts.estimatedApiCost)}
                                </span>
                              </div>
                              <div className="flex items-start justify-between">
                                <span className="text-sm text-secondary">Subscription Tiers</span>
                                <div className="text-right">
                                  {claudeCosts.monthlyTiers.slice(0, 3).map((tier) => (
                                    <div key={tier.name} className={`text-xs ${claudeUsage.detectedTier === tier.name ? 'text-accent font-medium' : 'text-muted'}`}>
                                      {tier.name}: ${tier.monthlyPrice}/mo
                                      {claudeUsage.detectedTier === tier.name && ' ✓'}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isLoadingClaudeUsage ? (
                      <div className="flex flex-col items-center justify-center py-6">
                        <svg className="w-6 h-6 text-accent animate-spin mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <p className="text-sm text-muted">Loading Claude Code usage data...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6">
                        <p className="text-sm text-muted">No Claude Code data found</p>
                        <p className="text-xs text-muted/70 mt-1">Claude Code data is stored in ~/.claude/projects/</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Claude Code Entries List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                      Recent Session Usage ({claudeUsage?.entries.length || 0} sessions)
                    </h3>
                  </div>
                  
                  {isLoadingClaudeUsage ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <svg className="w-8 h-8 text-accent animate-spin mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <p className="text-sm text-muted">Scanning Claude Code sessions...</p>
                    </div>
                  ) : !claudeUsage || claudeUsage.entries.length === 0 ? (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 mx-auto text-muted/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-muted">No Claude Code usage data found</p>
                      <p className="text-xs text-muted/70 mt-1">Run Claude Code agents to see usage data here</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {claudeUsage.entries.slice(-50).reverse().map((entry: ClaudeUsageEntry, index: number) => (
                        <div
                          key={`${entry.sessionId}-${index}`}
                          className="p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {formatProjectPath(entry.projectPath)}
                                </span>
                                {entry.model && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted">
                                    {entry.model.replace('claude-', '').replace(/-\d+$/, '')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                <span>{formatDate(entry.timestamp)}</span>
                                <span>{formatNumber(entry.inputTokens)} in / {formatNumber(entry.outputTokens)} out</span>
                                {entry.durationMs > 0 && (
                                  <span>⏱ {formatDuration(entry.durationMs)}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-muted flex-shrink-0">
                              {formatNumber(entry.totalTokens)} tokens
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {/* Project Summary Cards */}
            <div className="px-6 py-4 border-b border-border flex-shrink-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-background border border-border">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">This Project</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary">Agent Runs</span>
                      <span className="text-sm font-medium text-foreground">{projectSummary.entryCount}</span>
                    </div>
                    {projectSummary.totalTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Tokens</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatNumber(projectSummary.totalTokens)}
                        </span>
                      </div>
                    )}
                    {projectSummary.totalCredits > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Credits</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatCredits(projectSummary.totalCredits)}
                        </span>
                      </div>
                    )}
                    {projectSummary.totalDurationMs > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Run Time</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatDuration(projectSummary.totalDurationMs)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-background border border-border">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">All Projects</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-secondary">Agent Runs</span>
                      <span className="text-sm font-medium text-foreground">{totalSummary.entryCount}</span>
                    </div>
                    {totalSummary.totalTokens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Tokens</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatNumber(totalSummary.totalTokens)}
                        </span>
                      </div>
                    )}
                    {totalSummary.totalCredits > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Credits</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatCredits(totalSummary.totalCredits)}
                        </span>
                      </div>
                    )}
                    {totalSummary.totalDurationMs > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-secondary">Total Run Time</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatDuration(totalSummary.totalDurationMs)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Entries List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Agent Run History</h3>
              
              {isLoadingProject ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg className="w-8 h-8 text-accent animate-spin mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <p className="text-sm text-muted">Loading project history...</p>
                </div>
              ) : projectEntries.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 mx-auto text-muted/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-muted">No activity recorded yet</p>
                  <p className="text-xs text-muted/70 mt-1">Run stories or generate PRDs to see history here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectEntries.slice().reverse().map((entry: CostEntry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-lg bg-background border border-border"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {entry.description}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted">
                              {entry.agentId}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                            <span>{formatDate(entry.timestamp)}</span>
                            {entry.inputTokens !== undefined && entry.outputTokens !== undefined && (
                              <span>{formatNumber(entry.inputTokens)} in / {formatNumber(entry.outputTokens)} out</span>
                            )}
                            {entry.durationMs !== undefined && entry.durationMs > 0 && (
                              <span>⏱ {formatDuration(entry.durationMs)}</span>
                            )}
                            {entry.totalTokens !== undefined && entry.inputTokens === undefined && (
                              <span>{formatNumber(entry.totalTokens)} tokens</span>
                            )}
                          </div>
                        </div>
                        {entry.credits !== undefined && entry.credits > 0 && (
                          <span className="text-sm font-medium text-accent flex-shrink-0">
                            {formatCredits(entry.credits)} credits
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-3 px-6 py-4 border-t border-border bg-background-secondary flex-shrink-0">
          <div className="flex gap-2">
            {activeTab === 'project' && (
              <>
                <button
                  onClick={handleClearProject}
                  disabled={projectEntries.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Project
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={totalSummary.entryCount === 0}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear All
                </button>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
