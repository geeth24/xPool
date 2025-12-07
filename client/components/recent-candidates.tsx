"use client"

import * as React from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { candidatesApi, Candidate } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

export function RecentCandidates() {
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function fetchCandidates() {
      try {
        const data = await candidatesApi.list(0, 5)
        setCandidates(data)
      } catch (error) {
        console.error("Failed to fetch recent candidates:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchCandidates()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="ml-4 space-y-1">
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-3 w-[100px]" />
            </div>
            <Skeleton className="ml-auto h-4 w-[50px]" />
          </div>
        ))}
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No candidates sourced yet.
      </div>
    )
  }

  const getAvatarUrl = (candidate: Candidate) => {
    if (candidate.github_username) {
      return `https://unavatar.io/github/${candidate.github_username}`
    }
    if (candidate.x_username) {
      return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
    }
    return ""
  }

  const getDisplayName = (candidate: Candidate) => {
    return candidate.display_name || candidate.github_username || candidate.x_username || "Unknown"
  }

  const getHandle = (candidate: Candidate) => {
    if (candidate.github_username) return candidate.github_username
    if (candidate.x_username) return `@${candidate.x_username.replace("@", "")}`
    return ""
  }

  return (
    <div className="space-y-8">
      {candidates.map((candidate) => (
        <div key={candidate.id} className="flex items-center">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={getAvatarUrl(candidate)}
              alt={getDisplayName(candidate)}
            />
            <AvatarFallback>
              {getDisplayName(candidate).substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">
              {getDisplayName(candidate)}
            </p>
            <p className="text-sm text-muted-foreground">
              {getHandle(candidate)}
            </p>
          </div>
          <div className="ml-auto font-medium text-xs">
            {candidate.skills_extracted?.[0] && `+${candidate.skills_extracted[0]}`}
          </div>
        </div>
      ))}
    </div>
  )
}
