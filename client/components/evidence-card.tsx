"use client"

import { EvidenceCard as EvidenceCardType, EvidenceFeedbackCreate } from "@/lib/api/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  MessageSquare,
  ChevronDown,
  Copy,
  Zap,
  Target,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { jobsApi } from "@/lib/api"
import { GrokLogo } from "@/components/ui/grok-logo"

interface EvidenceCardProps {
  evidence: EvidenceCardType
  candidateName?: string
  jobId?: string
  candidateId?: string
  onEvidenceUpdated?: (newEvidence: EvidenceCardType) => void
}

const matchStrengthColors = {
  strong: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  moderate: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  weak: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  mismatch: "bg-red-500/10 text-red-500 border-red-500/20",
  unknown: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
}

const matchStrengthIcons = {
  strong: "🎯",
  moderate: "📊",
  weak: "⚠️",
  mismatch: "❌",
  unknown: "❓",
}

// feedback item component for individual items
interface FeedbackItemProps {
  content: string
  itemType: string
  itemIndex: number
  jobId?: string
  candidateId?: string
  variant?: "green" | "red" | "neutral" | "question"
}

function FeedbackItem({ content, itemType, itemIndex, jobId, candidateId, variant = "neutral" }: FeedbackItemProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: "positive" | "negative") => {
    if (!jobId || !candidateId) return
    
    setIsSubmitting(true)
    try {
      const feedbackData: EvidenceFeedbackCreate = {
        feedback_type: type,
        feedback_target: itemType,
        comment: `Item ${itemIndex + 1}: ${content.substring(0, 100)}`,
      }
      await jobsApi.submitEvidenceFeedback(jobId, candidateId, feedbackData)
      setFeedback(type)
    } catch {
      toast.error("Failed to submit feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  const variantStyles = {
    green: "text-emerald-400",
    red: "text-red-400",
    neutral: "text-zinc-400",
    question: "text-blue-400",
  }

  const prefix = {
    green: "+",
    red: "-",
    neutral: "•",
    question: `${itemIndex + 1}.`,
  }

  return (
    <li className="text-xs text-zinc-300 flex items-start gap-1 group">
      <span className={`${variantStyles[variant]} mt-0.5 shrink-0`}>{prefix[variant]}</span>
      <span className="flex-1">{content}</span>
      {jobId && candidateId && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {feedback ? (
            <span className="text-[10px] text-zinc-500">
              {feedback === "positive" ? "👍" : "👎"}
            </span>
          ) : (
            <>
              <button
                onClick={() => handleFeedback("positive")}
                disabled={isSubmitting}
                className="p-0.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ThumbsUp className="h-3 w-3" />
                )}
              </button>
              <button
                onClick={() => handleFeedback("negative")}
                disabled={isSubmitting}
                className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ThumbsDown className="h-3 w-3" />
                )}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

// signal badge with feedback
interface SignalBadgeProps {
  signal: string
  itemType: string
  itemIndex: number
  jobId?: string
  candidateId?: string
  className?: string
}

function SignalBadge({ signal, itemType, itemIndex, jobId, candidateId, className }: SignalBadgeProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: "positive" | "negative") => {
    if (!jobId || !candidateId) return
    
    setIsSubmitting(true)
    try {
      const feedbackData: EvidenceFeedbackCreate = {
        feedback_type: type,
        feedback_target: itemType,
        comment: `Signal: ${signal}`,
      }
      await jobsApi.submitEvidenceFeedback(jobId, candidateId, feedbackData)
      setFeedback(type)
    } catch {
      toast.error("Failed to submit feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-0.5 group">
      <Badge
        variant="outline"
        className={`text-xs ${className} ${feedback === "positive" ? "ring-1 ring-emerald-500" : feedback === "negative" ? "ring-1 ring-red-500 opacity-50" : ""}`}
      >
        {signal}
      </Badge>
      {jobId && candidateId && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {feedback ? (
            <span className="text-[10px] ml-0.5">
              {feedback === "positive" ? "👍" : "👎"}
            </span>
          ) : (
            <>
              <button
                onClick={() => handleFeedback("positive")}
                disabled={isSubmitting}
                className="p-0.5 rounded hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
              >
                <ThumbsUp className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={() => handleFeedback("negative")}
                disabled={isSubmitting}
                className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <ThumbsDown className="h-2.5 w-2.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function EvidenceCardComponent({
  evidence,
  candidateName,
  jobId,
  candidateId,
  onEvidenceUpdated,
}: EvidenceCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const copyOutreachHook = () => {
    if (evidence.outreach_hook) {
      navigator.clipboard.writeText(evidence.outreach_hook)
      toast.success("Outreach hook copied to clipboard!")
    }
  }

  const handleRegenerate = async () => {
    if (!jobId || !candidateId) {
      toast.error("Cannot regenerate - missing job or candidate info")
      return
    }

    setIsRegenerating(true)
    try {
      const result = await jobsApi.regenerateEvidence(jobId, candidateId)
      toast.success(`Evidence regenerated using ${result.feedback_used} feedback examples`)
      if (onEvidenceUpdated && result.evidence) {
        onEvidenceUpdated(result.evidence as EvidenceCardType)
      }
    } catch (error) {
      console.error("Failed to regenerate evidence:", error)
      toast.error("Failed to regenerate evidence")
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-zinc-800/30 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {matchStrengthIcons[evidence.match_strength]}
                </span>
                <CardTitle className="text-sm font-medium">
                  Evidence Card
                </CardTitle>
                <Badge
                  variant="outline"
                  className={matchStrengthColors[evidence.match_strength]}
                >
                  {evidence.match_strength.toUpperCase()} MATCH
                </Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
              {evidence.why_matched}
            </p>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Why Matched */}
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
                  Why This Candidate
                </span>
              </div>
              <p className="text-sm text-zinc-300">{evidence.why_matched}</p>
            </div>

            {/* Relevant Repos */}
            {evidence.relevant_repos.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="h-4 w-4 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">
                    Relevant Repositories
                  </span>
                </div>
                <div className="space-y-2">
                  {evidence.relevant_repos.map((repo, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-zinc-800/30 border border-zinc-700/50"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-zinc-200">
                          {repo.name}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mb-1">
                        {repo.relevance}
                      </p>
                      {repo.signals.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {repo.signals.map((signal, j) => (
                            <SignalBadge
                              key={j}
                              signal={signal}
                              itemType="repo_signal"
                              itemIndex={j}
                              jobId={jobId}
                              candidateId={candidateId}
                              className="text-[10px] py-0 h-5 bg-violet-500/10 text-violet-300 border-violet-500/20"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signals */}
            {evidence.signals.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    Technical Signals
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {evidence.signals.map((signal, i) => (
                    <SignalBadge
                      key={i}
                      signal={signal}
                      itemType="signals"
                      itemIndex={i}
                      jobId={jobId}
                      candidateId={candidateId}
                      className="bg-amber-500/10 text-amber-300 border-amber-500/20"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Green & Red Flags */}
            <div className="grid grid-cols-2 gap-3">
              {evidence.green_flags.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                      Green Flags
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {evidence.green_flags.map((flag, i) => (
                      <FeedbackItem
                        key={i}
                        content={flag}
                        itemType="green_flags"
                        itemIndex={i}
                        jobId={jobId}
                        candidateId={candidateId}
                        variant="green"
                      />
                    ))}
                  </ul>
                </div>
              )}
              {evidence.red_flags.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                      Red Flags
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {evidence.red_flags.map((flag, i) => (
                      <FeedbackItem
                        key={i}
                        content={flag}
                        itemType="red_flags"
                        itemIndex={i}
                        jobId={jobId}
                        candidateId={candidateId}
                        variant="red"
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Suggested Questions */}
            {evidence.suggested_questions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                    Suggested Interview Questions
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {evidence.suggested_questions.map((q, i) => (
                    <FeedbackItem
                      key={i}
                      content={q}
                      itemType="questions"
                      itemIndex={i}
                      jobId={jobId}
                      candidateId={candidateId}
                      variant="question"
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Outreach Hook */}
            {evidence.outreach_hook && (
              <div className="p-3 rounded-lg bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GrokLogo className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
                      Personalized Outreach
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={copyOutreachHook}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-zinc-200 italic">
                  &ldquo;{evidence.outreach_hook}&rdquo;
                </p>
              </div>
            )}

            {/* Regenerate Button */}
            {jobId && candidateId && (
              <div className="pt-3 border-t border-zinc-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    Rate items above to improve AI • Then regenerate
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Regenerate Evidence
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
