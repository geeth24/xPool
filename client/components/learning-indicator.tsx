"use client"

import * as React from "react"
import { Brain, TrendingUp, ChevronDown, ChevronUp } from "lucide-react"
import { GrokLogo } from "@/components/ui/grok-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { jobsApi, LearnedPattern } from "@/lib/api"
import { cn } from "@/lib/utils"

interface LearningIndicatorProps {
  jobId: string
  className?: string
  showDetails?: boolean
}

export function LearningIndicator({ 
  jobId, 
  className,
  showDetails = false 
}: LearningIndicatorProps) {
  const [pattern, setPattern] = React.useState<LearnedPattern | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    async function fetchPattern() {
      try {
        const response = await jobsApi.getLearnedPattern(jobId)
        setPattern(response.pattern)
      } catch (error) {
        console.error("Failed to fetch learned pattern:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchPattern()
  }, [jobId])

  if (loading) {
    return null
  }

  if (!pattern || pattern.confidence < 0.1) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
              "bg-muted/50 text-muted-foreground border border-dashed",
              className
            )}>
              <Brain className="h-3 w-3" />
              <span>Learning...</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-sm">
              Take actions (shortlist, hire, reject) to train the AI. 
              It will learn your preferences and improve rankings.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const confidencePercent = Math.round(pattern.confidence * 100)
  const totalPositive = pattern.hire_count + pattern.shortlist_count

  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
              "animate-in fade-in duration-300",
              className
            )}>
              <GrokLogo className="h-3 w-3" />
              <span>AI Learning Active</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-emerald-500/20">
                {confidencePercent}%
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm p-3">
            <div className="space-y-2">
              <p className="font-medium flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-emerald-500" />
                Learning from your actions
              </p>
              <p className="text-sm text-muted-foreground">
                Based on {totalPositive} positive and {pattern.reject_count} negative actions, 
                the AI has learned preferences for <span className="font-medium">{pattern.role_type.replace(/_/g, " ")}</span> roles.
              </p>
              {pattern.successful_skills.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {pattern.successful_skills.slice(0, 5).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-[10px] h-5">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <div className="rounded-lg border bg-gradient-to-r from-emerald-500/5 to-blue-500/5 p-4">
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-0 h-auto hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10">
                <Brain className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">AI Learning Active</p>
                <p className="text-xs text-muted-foreground">
                  {pattern.total_actions} actions • {confidencePercent}% confidence
                </p>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="pt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2 rounded-md bg-background/50">
              <p className="text-lg font-bold text-emerald-500">{pattern.hire_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hires</p>
            </div>
            <div className="p-2 rounded-md bg-background/50">
              <p className="text-lg font-bold text-blue-500">{pattern.shortlist_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Shortlisted</p>
            </div>
            <div className="p-2 rounded-md bg-background/50">
              <p className="text-lg font-bold text-rose-500">{pattern.reject_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rejected</p>
            </div>
          </div>

          {pattern.successful_skills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Skills that led to hires
              </p>
              <div className="flex flex-wrap gap-1">
                {pattern.successful_skills.slice(0, 8).map((skill) => (
                  <Badge 
                    key={skill} 
                    variant="secondary" 
                    className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {pattern.successful_signals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Positive signals learned
              </p>
              <div className="flex flex-wrap gap-1">
                {pattern.successful_signals.slice(0, 5).map((signal) => (
                  <Badge 
                    key={signal} 
                    variant="outline" 
                    className="text-xs"
                  >
                    {signal.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {pattern.rejection_patterns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Patterns to avoid
              </p>
              <div className="flex flex-wrap gap-1">
                {pattern.rejection_patterns.slice(0, 5).map((pattern) => (
                  <Badge 
                    key={pattern} 
                    variant="secondary" 
                    className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  >
                    {pattern.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {pattern.avg_dev_score && (
            <p className="text-xs text-muted-foreground">
              Average dev score of hires: <span className="font-medium">{Math.round(pattern.avg_dev_score)}/100</span>
            </p>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

