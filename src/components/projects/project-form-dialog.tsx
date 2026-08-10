"use client";

import { useState, useTransition } from "react";
import {
  createProject,
  updateProject,
} from "@/lib/actions/project-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

type ProjectValues = {
  id?: string;
  name?: string;
  companyId?: string;
  status?: "UPCOMING" | "ACTIVE" | "COMPLETED";
  siteStreet?: string | null;
  siteCity?: string | null;
  siteState?: string | null;
  siteZip?: string | null;
  expectedStart?: Date | null;
  expectedEnd?: Date | null;
  notes?: string | null;
};

function toDateInput(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function ProjectFormDialog({
  project,
  companies,
  fixedCompanyId,
}: {
  project?: ProjectValues;
  companies: { id: string; name: string }[];
  fixedCompanyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isEdit = !!project?.id;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = isEdit
        ? await updateProject(project!.id!, formData)
        : await createProject(formData);
      if (result.ok) {
        toast.success(isEdit ? "Project updated" : "Project created");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm" className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ) : (
          <Button className="gap-1">
            <Plus className="h-4 w-4" /> New project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project name *</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="I-95 Overpass Phase 2"
              defaultValue={project?.name ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Company *</Label>
              {fixedCompanyId ? (
                <input type="hidden" name="companyId" value={fixedCompanyId} />
              ) : (
                <Select
                  name="companyId"
                  defaultValue={project?.companyId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select name="status" defaultValue={project?.status ?? "UPCOMING"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPCOMING">Upcoming</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="siteStreet">Site street</Label>
            <Input
              id="siteStreet"
              name="siteStreet"
              defaultValue={project?.siteStreet ?? ""}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="siteCity">City</Label>
              <Input
                id="siteCity"
                name="siteCity"
                defaultValue={project?.siteCity ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="siteState">State</Label>
              <Input
                id="siteState"
                name="siteState"
                defaultValue={project?.siteState ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="siteZip">ZIP</Label>
              <Input
                id="siteZip"
                name="siteZip"
                defaultValue={project?.siteZip ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expectedStart">Expected start</Label>
              <Input
                id="expectedStart"
                name="expectedStart"
                type="date"
                defaultValue={toDateInput(project?.expectedStart)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedEnd">Expected end</Label>
              <Input
                id="expectedEnd"
                name="expectedEnd"
                type="date"
                defaultValue={toDateInput(project?.expectedEnd)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={project?.notes ?? ""}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
