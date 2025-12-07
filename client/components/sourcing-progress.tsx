"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { Github, Search, Users, Sparkles, CheckCircle2, Loader2, AlertCircle, X, ArrowRight } from "lucide-react"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { tasksApi } from "@/lib/api"
import type { TaskStatus, TaskProgress } from "@/lib/api/types"

interface SourcingProgressProps {
  taskId: string
  source?: "github" | "x"
  jobTitle?: string
  searchQuery?: string
  onComplete?: (result: Record<string, unknown>) => void
  onDismiss?: () => void
}

const STAGE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  initializing: { icon: <Loader2 className="size-4 animate-spin" />, color: "text-muted-foreground" },
  searching: { icon: <Search className="size-4" />, color: "text-foreground/70" },
  analyzing: { icon: <Users className="size-4" />, color: "text-foreground/70" },
  enriching: { icon: <Sparkles className="size-4" />, color: "text-foreground/70" },
  complete: { icon: <CheckCircle2 className="size-4" />, color: "text-foreground" },
}

export function SourcingProgress({
  taskId,
  source,
  jobTitle,
  searchQuery,
  onComplete,
  onDismiss,
}: SourcingProgressProps) {
  const router = useRouter()
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await tasksApi.getStatus(taskId)
      setStatus(result)

      if (result.status === "SUCCESS" || result.status === "FAILURE") {
        setIsPolling(false)
        if (result.status === "SUCCESS" && onComplete) {
          onComplete(result.result as Record<string, unknown>)
        }
      }
    } catch (err) {
      console.error("Failed to fetch task status:", err)
      setError("Failed to fetch status")
    }
  }, [taskId, onComplete])

  useEffect(() => {
    fetchStatus()

    if (!isPolling) return

    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus, isPolling])

  // Handle different status types
  const isProgressStatus = status?.status === "PROGRESS"
  const progress = isProgressStatus ? (status?.result as TaskProgress | undefined) : undefined
  
  const stage = progress?.stage || "initializing"
  const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG.initializing
  const progressValue = progress?.progress || (status?.status === "PENDING" ? 0 : status?.status === "STARTED" ? 10 : 0)
  const stageLabel = progress?.stage_label || (status?.status === "PENDING" ? "Queued..." : status?.status === "STARTED" ? "Starting..." : "Initializing...")

  const isComplete = status?.status === "SUCCESS"
  const isFailed = status?.status === "FAILURE" || error

  const details = progress?.details || {}
  
  // Get final result for complete state
  const finalResult = isComplete ? (status?.result as Record<string, unknown>) : null

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "w-full max-w-2xl my-3 rounded-xl overflow-hidden transition-all glass-card",
        isComplete && "border-foreground/20"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
        <div className="p-2 rounded-lg bg-foreground text-background">
          <Github className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">GitHub Sourcing</p>
          <p className="text-xs text-muted-foreground truncate">
            {jobTitle || searchQuery || "Finding candidates..."}
          </p>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onDismiss}>
            <X className="size-3" />
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-3 space-y-3">
        {isFailed ? (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="size-4" />
            <span>Sourcing failed. Please try again.</span>
          </div>
        ) : (
          <>
            {/* Stage indicator */}
            <div className="flex items-center gap-2">
              <span className={cn("transition-colors", stageConfig.color)}>
                {stageConfig.icon}
              </span>
              <span className="text-sm font-medium">{stageLabel}</span>
              {!isComplete && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {progressValue}%
                </span>
              )}
            </div>

            {/* Progress bar */}
            <Progress 
              value={progressValue} 
              className="h-2 transition-all"
            />

            {/* Details */}
            {Object.keys(details).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                {details.candidates_found !== undefined && (
                  <span>
                    <span className="font-medium text-foreground">{details.candidates_found}</span> found
                  </span>
                )}
                {details.candidates_analyzed !== undefined && (
                  <span>
                    <span className="font-medium text-foreground">{details.candidates_analyzed}</span> analyzed
                  </span>
                )}
                {details.candidates_skipped !== undefined && details.candidates_skipped > 0 && (
                  <span>
                    <span className="font-medium text-foreground">{details.candidates_skipped}</span> skipped
                  </span>
                )}
                {details.candidates_with_x !== undefined && (
                  <span>
                    <span className="font-medium text-foreground">{details.candidates_with_x}</span> with X
                  </span>
                )}
                {details.current_user && (
                  <span className="truncate max-w-[150px]">
                    Analyzing: <span className="font-medium text-foreground">@{details.current_user}</span>
                  </span>
                )}
              </div>
            )}

            {/* Complete message */}
            {isComplete && finalResult && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-foreground text-sm">
                  <CheckCircle2 className="size-4" />
                  <span>
                    Sourcing complete! Found{" "}
                    <span className="font-semibold">
                      {String(finalResult.candidates_added ?? finalResult.candidates_found ?? 0)}
                    </span>{" "}
                    candidates
                    {finalResult.candidates_with_x ? (
                      <span className="text-muted-foreground"> ({String(finalResult.candidates_with_x)} with X profiles)</span>
                    ) : null}
                  </span>
                </div>
                {finalResult.job_id && (
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => {
                      router.push(`/jobs/${finalResult.job_id}`)
                      onDismiss?.()
                    }}
                  >
                    View Results
                    <ArrowRight className="size-4 ml-2" />
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

