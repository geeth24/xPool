"use client"

import * as React from "react"
import { MoreHorizontal, RefreshCw, Github, Search, Filter } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { candidatesApi, Candidate, CandidateType } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

function getDisplayUsername(candidate: Candidate): string {
  if (candidate.x_username) return candidate.x_username
  if (candidate.github_username) return candidate.github_username
  return "unknown"
}

function getAvatarUrl(candidate: Candidate): string {
  if (candidate.x_username) {
    return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
  }
  if (candidate.github_username) {
    return `https://unavatar.io/github/${candidate.github_username}`
  }
  return ""
}

export function CandidatesTable() {
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")

  const fetchCandidates = React.useCallback(async () => {
    try {
      setLoading(true)
      let data: Candidate[]
      if (typeFilter && typeFilter !== "all") {
        data = await candidatesApi.getByType(typeFilter)
      } else {
        data = await candidatesApi.list()
      }
      setCandidates(data)
    } catch (error) {
      toast.error("Failed to fetch candidates", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  React.useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  const filteredCandidates = candidates.filter(
    (candidate) =>
      candidate.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
      candidate.x_username?.toLowerCase().includes(filter.toLowerCase()) ||
      candidate.github_username?.toLowerCase().includes(filter.toLowerCase())
  )

  const handleReclassify = async (candidateId: string) => {
    try {
      const result = await candidatesApi.reclassify(candidateId)
      toast.success("Reclassification started", {
        description: `Task ID: ${result.task_id}`,
      })
    } catch {
      toast.error("Failed to reclassify candidate")
    }
  }

  const getTypeVariant = (type?: CandidateType) => {
    switch (type) {
      case CandidateType.DEVELOPER:
        return "default"
      case CandidateType.INFLUENCER:
        return "secondary"
      case CandidateType.RECRUITER:
        return "destructive"
      case CandidateType.COMPANY:
        return "outline"
      case CandidateType.BOT:
        return "destructive"
      default:
        return "outline"
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex gap-4">
           <Skeleton className="h-10 w-64" />
           <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center p-4 gap-3 border-b bg-muted/10">
        <div className="relative max-w-sm flex-1">
           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
           <Input
            placeholder="Search candidates..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
           <Filter className="h-4 w-4 text-muted-foreground" />
           <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="developer">Developer</SelectItem>
              <SelectItem value="influencer">Influencer</SelectItem>
              <SelectItem value="recruiter">Recruiter</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="bot">Bot</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="ml-auto">
          <Button variant="ghost" size="icon" onClick={fetchCandidates} title="Refresh List">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="pl-6">Candidate</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCandidates.length > 0 ? (
              filteredCandidates.map((candidate) => (
                <TableRow key={candidate.id} className="hover:bg-muted/10">
                  <TableCell className="pl-6 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarImage
                          src={getAvatarUrl(candidate)}
                          alt={candidate.display_name || getDisplayUsername(candidate)}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {(candidate.display_name || getDisplayUsername(candidate))
                            .substring(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">
                          {candidate.display_name || getDisplayUsername(candidate)}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {candidate.github_username && (
                            <a
                              href={`https://github.com/${candidate.github_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <Github className="h-3 w-3" />
                              {candidate.github_username}
                            </a>
                          )}
                          {candidate.x_username && (
                            <a
                              href={`https://x.com/${candidate.x_username.replace("@", "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                              @{candidate.x_username.replace("@", "")}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getTypeVariant(candidate.candidate_type)}
                      className="capitalize font-normal"
                    >
                      {candidate.candidate_type || "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {candidate.type_confidence ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", 
                              candidate.type_confidence > 0.8 ? "bg-emerald-500" :
                              candidate.type_confidence > 0.5 ? "bg-amber-500" : "bg-red-500"
                            )}
                            style={{ width: `${candidate.type_confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">
                          {Math.round(candidate.type_confidence * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[250px]">
                      {candidate.skills_extracted?.slice(0, 3).map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-secondary/50 font-normal border-0"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {candidate.skills_extracted &&
                        candidate.skills_extracted.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            +{candidate.skills_extracted.length - 3}
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate" title={candidate.location || ""}>
                    {candidate.location || "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() =>
                            navigator.clipboard.writeText(getDisplayUsername(candidate))
                          }
                        >
                          Copy Username
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {candidate.github_username && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`https://github.com/${candidate.github_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View GitHub
                            </a>
                          </DropdownMenuItem>
                        )}
                        {candidate.x_username && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`https://x.com/${candidate.x_username.replace("@", "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View on X
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleReclassify(candidate.id)}
                        >
                          Reclassify
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                   No candidates found matching your criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4 py-4 border-t bg-muted/10">
        <div className="text-xs text-muted-foreground">
          Showing {filteredCandidates.length} of {candidates.length} candidates
        </div>
         <div className="flex gap-1">
           <Button variant="outline" size="sm" disabled className="h-7 text-xs">Previous</Button>
           <Button variant="outline" size="sm" disabled className="h-7 text-xs">Next</Button>
         </div>
      </div>
    </div>
  )
}
