"use client"

import * as React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { Github, Search, Users, Sparkles, CheckCircle2, Loader2, AlertCircle, X, ArrowRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { tasksApi } from "@/lib/api"
import type { TaskStatus, TaskProgress } from "@/lib/api/types"

interface SourcingProgressProps {
  taskId: string
  jobId?: string
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
  jobId: propJobId,
  source: _source,
  jobTitle,
  searchQuery,
  onComplete,
  onDismiss,
}: SourcingProgressProps) {
  void _source
  const router = useRouter()
  const [jobId, setJobId] = useState<string | undefined>(propJobId)
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(true)
  const [showComplete, setShowComplete] = useState(false)
  const hasCalledComplete = useRef(false)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await tasksApi.getStatus(taskId)
      setStatus(result)

      // capture job_id from progress details or final result
      const progressDetails = (result.result as TaskProgress | undefined)?.details
      const finalJobId = progressDetails?.job_id || (result.result as Record<string, unknown>)?.job_id
      if (finalJobId && !jobId) {
        setJobId(finalJobId as string)
      }

      if (result.status === "SUCCESS" || result.status === "FAILURE") {
        setIsPolling(false)
        
        if (result.status === "SUCCESS") {
          // delay showing complete state for smooth transition
          setTimeout(() => {
            setShowComplete(true)
            if (onComplete && !hasCalledComplete.current) {
              hasCalledComplete.current = true
              onComplete(result.result as Record<string, unknown>)
            }
          }, 500)
        }
      }
    } catch (err) {
      console.error("Failed to fetch task status:", err)
      setError("Failed to fetch status")
    }
  }, [taskId, onComplete, jobId])

  useEffect(() => {
    // initial fetch on mount
    let mounted = true
    const doFetch = async () => {
      if (mounted) {
        await fetchStatus()
      }
    }
    doFetch()
    
    return () => { mounted = false }
    // only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
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

  const isComplete = status?.status === "SUCCESS" && showComplete
  const isFailed = status?.status === "FAILURE" || error

  const details = progress?.details || {}
  
  // Get final result for complete state
  const finalResult = isComplete ? (status?.result as Record<string, unknown>) : null

  const handleCardClick = () => {
    if (isComplete && jobId) {
      router.push(`/jobs/${jobId}`)
      onDismiss?.()
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={handleCardClick}
      className={cn(
        "w-full max-w-2xl my-3 rounded-xl overflow-hidden transition-all glass-card",
        isComplete && "border-foreground/20 cursor-pointer hover:bg-foreground/5"
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
          <Button 
            variant="ghost" 
            size="icon" 
            className="size-7" 
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-3 space-y-3">
        {isFailed ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-destructive text-sm"
          >
            <AlertCircle className="size-4" />
            <span>Sourcing failed. Please try again.</span>
          </motion.div>
        ) : (
          <>
            {/* Stage indicator */}
            <AnimatePresence mode="wait">
              <motion.div 
                key={isComplete ? "complete" : stage}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <span className={cn("transition-colors", isComplete ? "text-foreground" : stageConfig.color)}>
                  {isComplete ? <CheckCircle2 className="size-4" /> : stageConfig.icon}
                </span>
                <span className="text-sm font-medium">
                  {isComplete ? "Complete" : stageLabel}
                </span>
                {!isComplete && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {progressValue}%
                  </span>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Progress bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Progress 
                value={isComplete ? 100 : progressValue} 
                className="h-2 transition-all"
              />
            </motion.div>

            {/* Details - show during progress */}
            <AnimatePresence>
              {!isComplete && Object.keys(details).length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1"
                >
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* Complete message */}
            <AnimatePresence>
              {isComplete && finalResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="space-y-3 pt-1"
                >
                  <div className="flex items-center gap-2 text-foreground text-sm">
                    <CheckCircle2 className="size-4" />
                    <span className="flex-1">
                      Sourcing complete! Found{" "}
                      <span className="font-semibold">
                        {String(finalResult.candidates_added ?? finalResult.candidates_found ?? 0)}
                      </span>{" "}
                      candidates
                      {finalResult.candidates_with_x ? (
                        <span className="text-muted-foreground"> ({String(finalResult.candidates_with_x)} with X profiles)</span>
                      ) : null}
                    </span>
                    {jobId && (
                      <ArrowRight className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  {jobId && (
                    <p className="text-xs text-muted-foreground">
                      Click to view candidates
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  )
}

