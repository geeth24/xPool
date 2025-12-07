"use client"

import { CandidatesTable } from "@/components/candidates-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users } from "lucide-react"

export default function CandidatesPage() {
  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Candidates</h2>
          <p className="text-muted-foreground mt-1">
            Global pool of all sourced candidates across all jobs.
          </p>
        </div>
      </div>
      
      <Card className="border-border/60">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <CardTitle>Candidate Pool</CardTitle>
              <CardDescription>
                 Search, filter, and manage your talent pipeline.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <CandidatesTable />
        </CardContent>
      </Card>
    </div>
  )
}
