"use client"

import * as React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { jobsApi, SearchStrategy } from "@/lib/api"
import { 
  Sparkles, 
  Code2, 
  MapPin, 
  Tag, 
  X, 
  Plus, 
  RefreshCw, 
  Save,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchStrategyCardProps {
  jobId: string
  jobTitle: string
  initialStrategy?: SearchStrategy | null
  onStrategyChange?: (strategy: SearchStrategy) => void
}

type TagCategory = "bio_keywords" | "repo_topics" | "languages" | "location_suggestions" | "negative_keywords"

const CATEGORY_CONFIG: Record<TagCategory, { label: string; icon: React.ReactNode; color: string; placeholder: string }> = {
  bio_keywords: {
    label: "Bio Keywords",
    icon: <Tag className="size-4" />,
    color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800",
    placeholder: "e.g. iOS developer"
  },
  repo_topics: {
    label: "Repo Topics",
    icon: <Code2 className="size-4" />,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800",
    placeholder: "e.g. swiftui"
  },
  languages: {
    label: "Languages",
    icon: <Code2 className="size-4" />,
    color: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800",
    placeholder: "e.g. Swift"
  },
  location_suggestions: {
    label: "Locations",
    icon: <MapPin className="size-4" />,
    color: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800",
    placeholder: "e.g. San Francisco"
  },
  negative_keywords: {
    label: "Exclude",
    icon: <AlertCircle className="size-4" />,
    color: "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800",
    placeholder: "e.g. recruiter"
  }
}

export function SearchStrategyCard({ 
  jobId, 
  jobTitle, 
  initialStrategy,
  onStrategyChange 
}: SearchStrategyCardProps) {
  const [strategy, setStrategy] = useState<SearchStrategy | null>(initialStrategy || null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editingCategory, setEditingCategory] = useState<TagCategory | null>(null)
  const [newTagValue, setNewTagValue] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  const fetchStrategy = async () => {
    setLoading(true)
    try {
      const result = await jobsApi.getSearchStrategy(jobId)
      setStrategy(result.search_strategy)
    } catch (error) {
      console.error("Failed to fetch search strategy:", error)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    if (!initialStrategy) {
      fetchStrategy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await jobsApi.generateSearchStrategy(jobId)
      setStrategy(result.search_strategy)
      setHasChanges(false)
      onStrategyChange?.(result.search_strategy)
      toast.success("Search strategy generated", {
        description: `Found ${result.search_strategy.bio_keywords.length} keywords and ${result.search_strategy.repo_topics.length} topics`
      })
    } catch (error) {
      toast.error("Failed to generate strategy", {
        description: error instanceof Error ? error.message : "Unknown error"
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!strategy) return
    setSaving(true)
    try {
      const result = await jobsApi.updateSearchStrategy(jobId, {
        bio_keywords: strategy.bio_keywords,
        repo_topics: strategy.repo_topics,
        languages: strategy.languages,
        location_suggestions: strategy.location_suggestions,
        negative_keywords: strategy.negative_keywords
      })
      setStrategy(result.search_strategy)
      setHasChanges(false)
      onStrategyChange?.(result.search_strategy)
      toast.success("Search strategy saved")
    } catch {
      toast.error("Failed to save strategy")
    } finally {
      setSaving(false)
    }
  }

  const handleAddTag = (category: TagCategory) => {
    if (!newTagValue.trim() || !strategy) return
    
    const updated = {
      ...strategy,
      [category]: [...strategy[category], newTagValue.trim()]
    }
    setStrategy(updated)
    setNewTagValue("")
    setEditingCategory(null)
    setHasChanges(true)
  }

  const handleRemoveTag = (category: TagCategory, index: number) => {
    if (!strategy) return
    
    const updated = {
      ...strategy,
      [category]: strategy[category].filter((_, i) => i !== index)
    }
    setStrategy(updated)
    setHasChanges(true)
  }

  const renderTagSection = (category: TagCategory) => {
    const config = CATEGORY_CONFIG[category]
    const tags = strategy?.[category] || []
    const isEditing = editingCategory === category

    return (
      <div key={category} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {config.icon}
            {config.label}
            <Badge variant="secondary" className="text-xs">{tags.length}</Badge>
          </div>
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setEditingCategory(category)}
            >
              <Plus className="size-3 mr-1" />
              Add
            </Button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, idx) => (
            <Badge 
              key={`${tag}-${idx}`}
              variant="outline" 
              className={cn("group cursor-default pr-1", config.color)}
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(category, idx)}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {tags.length === 0 && !isEditing && (
            <span className="text-xs text-muted-foreground italic">No {config.label.toLowerCase()} set</span>
          )}
        </div>

        {isEditing && (
          <div className="flex gap-2 mt-2">
            <Input
              placeholder={config.placeholder}
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleAddTag(category)
                }
                if (e.key === "Escape") {
                  setEditingCategory(null)
                  setNewTagValue("")
                }
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={() => handleAddTag(category)}>
              Add
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8"
              onClick={() => {
                setEditingCategory(null)
                setNewTagValue("")
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <Card animated={false}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60" animated={false}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Search Strategy</CardTitle>
              <CardDescription className="text-xs">
                AI-optimized search tags for {jobTitle}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8"
              >
                {saving ? (
                  <RefreshCw className="size-3 mr-1 animate-spin" />
                ) : (
                  <Save className="size-3 mr-1" />
                )}
                Save
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generating}
              className="h-8"
            >
              {generating ? (
                <RefreshCw className="size-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="size-3 mr-1" />
              )}
              {strategy ? "Regenerate" : "Generate"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {!strategy ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="size-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No search strategy generated yet</p>
              <p className="text-xs mt-1">Click &quot;Generate&quot; to create AI-optimized search tags</p>
            </div>
          ) : (
            <>
              {strategy.role_type && strategy.role_type !== "unknown" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Detected Role:</span>
                  <Badge variant="secondary" className="capitalize">
                    {strategy.role_type.replace(/_/g, " ")}
                  </Badge>
                </div>
              )}
              
              <div className="grid gap-4">
                {renderTagSection("bio_keywords")}
                {renderTagSection("repo_topics")}
                {renderTagSection("languages")}
                {renderTagSection("location_suggestions")}
                {renderTagSection("negative_keywords")}
              </div>

              {strategy.seniority_signals && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Seniority Signals (read-only)</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="font-medium text-muted-foreground">Junior:</span>
                      <p className="text-foreground/70">{strategy.seniority_signals.junior?.slice(0, 2).join(", ")}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Senior:</span>
                      <p className="text-foreground/70">{strategy.seniority_signals.senior?.slice(0, 2).join(", ")}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Staff+:</span>
                      <p className="text-foreground/70">{strategy.seniority_signals.staff?.slice(0, 2).join(", ")}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

