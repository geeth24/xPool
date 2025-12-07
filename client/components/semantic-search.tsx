"use client"

import * as React from "react"
import { useState } from "react"
import { Search, Loader2, Sparkles, Github, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { candidatesApi } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SemanticCandidate {
  id: string
  display_name: string
  github_username: string
  x_username: string
  bio: string
  skills_extracted: string[]
  location: string
  relevance_score: number
  github_url: string
  profile_url: string
  grok_summary: string
}

interface SemanticSearchProps {
  jobId?: string
  onSelectCandidate?: (candidateId: string) => void
  triggerClassName?: string
}

const EXAMPLE_QUERIES = [
  "Python developers with machine learning experience",
  "iOS engineers familiar with SwiftUI",
  "Backend developers who know Kubernetes",
  "Full stack engineers with React and Node.js",
  "Data engineers experienced with Spark",
]

export function SemanticSearch({ jobId, onSelectCandidate, triggerClassName }: SemanticSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SemanticCandidate[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query
    if (!q.trim() || q.length < 3) return
    
    setLoading(true)
    setError(null)
    setSearched(true)
    
    try {
      const result = await candidatesApi.semanticSearch(q, 20, jobId)
      setResults(result.candidates)
      if (result.candidates.length === 0) {
        setError("No candidates found. Try a different query or upload candidates to the collection first.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("gap-2", triggerClassName)}>
          <Sparkles className="h-4 w-4" />
          AI Search
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Semantic Candidate Search
          </DialogTitle>
          <DialogDescription>
            Search your candidate pool using natural language. Powered by xAI Collections.
          </DialogDescription>
        </DialogHeader>
        
        {/* Search Input */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="e.g., Python developers with ML experience..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button onClick={() => handleSearch()} disabled={loading || query.length < 3}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {/* Example queries */}
        {!searched && (
          <div className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">Try these example searches:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((eq) => (
                <button
                  key={eq}
                  onClick={() => {
                    setQuery(eq)
                    handleSearch(eq)
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors"
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Searching collection...</span>
            </div>
          )}
          
          {error && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {!loading && !error && results.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Found {results.length} candidates matching &quot;{query}&quot;
              </p>
              {results.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors",
                    onSelectCandidate && "cursor-pointer"
                  )}
                  onClick={() => onSelectCandidate?.(c.id)}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={c.github_username ? `https://github.com/${c.github_username}.png` : undefined} />
                    <AvatarFallback>{(c.display_name || c.github_username || "?").substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.display_name || c.github_username}</span>
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-xs",
                          c.relevance_score >= 80 && "bg-emerald-500/10 text-emerald-600",
                          c.relevance_score >= 60 && c.relevance_score < 80 && "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {c.relevance_score}% relevant
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {c.github_username && (
                        <a 
                          href={`https://github.com/${c.github_username}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="hover:text-primary flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Github className="h-3 w-3" /> {c.github_username}
                        </a>
                      )}
                      {c.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.location}
                        </span>
                      )}
                    </div>
                    
                    {c.skills_extracted && c.skills_extracted.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.skills_extracted.slice(0, 6).map(skill => (
                          <Badge key={skill} variant="outline" className="text-[10px] h-5">{skill}</Badge>
                        ))}
                        {c.skills_extracted.length > 6 && (
                          <Badge variant="outline" className="text-[10px] h-5">+{c.skills_extracted.length - 6}</Badge>
                        )}
                      </div>
                    )}
                    
                    {c.grok_summary && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{c.grok_summary}</p>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
          
          {!loading && !error && searched && results.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No candidates found for &quot;{query}&quot;</p>
              <p className="text-xs mt-1">Try a different search or upload candidates to the collection</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

