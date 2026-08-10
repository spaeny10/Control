"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCompany,
  updateCompany,
} from "@/lib/actions/company-actions";
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

type CompanyValues = {
  id?: string;
  name?: string;
  billingStreet?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  website?: string | null;
  notes?: string | null;
  parentCompanyId?: string | null;
};

const NO_PARENT = "__none__";

export function CompanyFormDialog({
  company,
  // Companies eligible to be a parent (top-level only). Empty hides the field.
  parentOptions = [],
}: {
  company?: CompanyValues;
  parentOptions?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!company?.id;

  function handleSubmit(formData: FormData) {
    if (formData.get("parentCompanyId") === NO_PARENT) {
      formData.set("parentCompanyId", "");
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateCompany(company!.id!, formData)
        : await createCompany(formData);
      if (result.ok) {
        toast.success(isEdit ? "Company updated" : "Company created");
        setOpen(false);
        if (!isEdit && result.id) router.push(`/companies/${result.id}`);
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
            <Plus className="h-4 w-4" /> New company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit company" : "New company"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={company?.name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingStreet">Billing street</Label>
            <Input
              id="billingStreet"
              name="billingStreet"
              defaultValue={company?.billingStreet ?? ""}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="billingCity">City</Label>
              <Input
                id="billingCity"
                name="billingCity"
                defaultValue={company?.billingCity ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingState">State</Label>
              <Input
                id="billingState"
                name="billingState"
                defaultValue={company?.billingState ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingZip">ZIP</Label>
              <Input
                id="billingZip"
                name="billingZip"
                defaultValue={company?.billingZip ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              defaultValue={company?.website ?? ""}
            />
          </div>
          {parentOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Branch of</Label>
              <Select
                name="parentCompanyId"
                defaultValue={company?.parentCompanyId ?? NO_PARENT}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Standalone company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>
                    Standalone company (no parent)
                  </SelectItem>
                  {parentOptions
                    .filter((p) => p.id !== company?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Branches keep their own quotes, contacts, and pricing; metrics
                roll up to the parent.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={company?.notes ?? ""}
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
