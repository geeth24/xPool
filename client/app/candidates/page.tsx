import { CandidatesTable } from "@/components/candidates-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function CandidatesPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Candidates</h2>
          <p className="text-muted-foreground">
            Review and manage sourced candidates.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Candidates</CardTitle>
          <CardDescription>
            A list of all candidates sourced from X (Twitter).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidatesTable />
        </CardContent>
      </Card>
    </div>
  )
}

