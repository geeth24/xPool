"use client"

import * as React from "react"
import { MoreHorizontal, RefreshCw, Github } from "lucide-react"

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

function getProfileUrl(candidate: Candidate): string {
  if (candidate.x_username) {
    return `https://x.com/${candidate.x_username.replace("@", "")}`
  }
  if (candidate.github_url) {
    return candidate.github_url
  }
  return "#"
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center py-4 gap-2">
        <Input
          placeholder="Filter candidates..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
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
        <Button variant="outline" size="icon" onClick={fetchCandidates}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
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
                <TableRow key={candidate.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={getAvatarUrl(candidate)}
                          alt={candidate.display_name || getDisplayUsername(candidate)}
                        />
                        <AvatarFallback>
                          {(candidate.display_name || getDisplayUsername(candidate))
                            .substring(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {candidate.display_name || getDisplayUsername(candidate)}
                        </span>
                        <div className="flex items-center gap-2">
                          {candidate.github_username && (
                            <a
                              href={`https://github.com/${candidate.github_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
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
                              className="text-xs text-muted-foreground hover:underline"
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
                      className="capitalize"
                    >
                      {candidate.candidate_type || "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {candidate.type_confidence ? (
                      <span
                        className={
                          candidate.type_confidence > 0.8
                            ? "text-green-500 font-bold"
                            : candidate.type_confidence > 0.5
                              ? "text-yellow-500 font-bold"
                              : "text-red-500 font-bold"
                        }
                      >
                        {Math.round(candidate.type_confidence * 100)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills_extracted?.slice(0, 3).map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {candidate.skills_extracted &&
                        candidate.skills_extracted.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{candidate.skills_extracted.length - 3}
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {candidate.location || "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
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
                <TableCell colSpan={6} className="h-24 text-center">
                  No candidates found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {filteredCandidates.length} of {candidates.length} candidates
        </div>
      </div>
    </div>
  )
}
