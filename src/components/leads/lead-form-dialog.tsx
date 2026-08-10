"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLead } from "@/lib/actions/lead-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function LeadFormDialog({
  companies,
  contacts,
}: {
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; companyId: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"NEW_COMPANY" | "NEW_PROJECT">(
    "NEW_COMPANY"
  );
  const [companyId, setCompanyId] = useState<string>("");
  const [estMrr, setEstMrr] = useState("");
  const [estMonths, setEstMonths] = useState("");
  const [estValue, setEstValue] = useState("");
  // Once the user types a total we stop auto-filling it from MRR x months.
  const [totalEdited, setTotalEdited] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const computedTotal =
    estMrr && estMonths
      ? Math.round(parseFloat(estMrr) * parseInt(estMonths) * 100) / 100
      : null;

  useEffect(() => {
    if (!totalEdited) {
      setEstValue(computedTotal !== null ? String(computedTotal) : "");
    }
  }, [computedTotal, totalEdited]);

  const companyContacts = useMemo(
    () => contacts.filter((c) => c.companyId === companyId),
    [contacts, companyId]
  );

  function handleSubmit(formData: FormData) {
    formData.set("type", type);
    startTransition(async () => {
      const result = await createLead(formData);
      if (result.ok) {
        toast.success("Lead created");
        setOpen(false);
        if (result.id) router.push(`/leads/${result.id}`);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1">
          <Plus className="h-4 w-4" /> New lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>

        <Tabs
          value={type}
          onValueChange={(v) => setType(v as typeof type)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="NEW_COMPANY">New company</TabsTrigger>
            <TabsTrigger value="NEW_PROJECT">
              New project (existing customer)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Lead title *</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder={
                type === "NEW_PROJECT"
                  ? "Downtown garage build — 2 trailers"
                  : "Acme Construction — intro"
              }
            />
          </div>

          <div className="space-y-2">
            <Label>
              Company {type === "NEW_PROJECT" ? "*" : "(if known)"}
            </Label>
            <Select
              name="companyId"
              value={companyId}
              onValueChange={setCompanyId}
              required={type === "NEW_PROJECT"}
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
            {type === "NEW_COMPANY" && (
              <p className="text-xs text-muted-foreground">
                Create the company first under Companies if it isn&apos;t
                listed, or leave blank for now.
              </p>
            )}
          </div>

          {type === "NEW_PROJECT" && (
            <div className="space-y-2">
              <Label htmlFor="newProjectName">Project name *</Label>
              <Input
                id="newProjectName"
                name="newProjectName"
                required
                placeholder="Westshore Plaza Redevelopment"
              />
              <p className="text-xs text-muted-foreground">
                A Project record is created and linked to this lead.
              </p>
            </div>
          )}

          {companyContacts.length > 0 && (
            <div className="space-y-2">
              <Label>Contact</Label>
              <Select name="contactId">
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {companyContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="estMrr">Est. MRR ($/mo)</Label>
              <Input
                id="estMrr"
                name="estMrr"
                type="number"
                min="0"
                step="0.01"
                value={estMrr}
                onChange={(e) => setEstMrr(e.target.value)}
                placeholder="3900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estMonths">Est. months</Label>
              <Input
                id="estMonths"
                name="estMonths"
                type="number"
                min="1"
                value={estMonths}
                onChange={(e) => setEstMonths(e.target.value)}
                placeholder="7"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estValue">Total value ($)</Label>
              <Input
                id="estValue"
                name="estValue"
                type="number"
                min="0"
                step="0.01"
                value={estValue}
                onChange={(e) => {
                  setEstValue(e.target.value);
                  setTotalEdited(true);
                }}
                placeholder="auto"
              />
              {!totalEdited && computedTotal !== null && (
                <p className="text-xs text-muted-foreground">
                  auto: MRR × months
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" placeholder="Referral" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedClose">Expected close</Label>
              <Input id="expectedClose" name="expectedClose" type="date" />
            </div>
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
              {isPending ? "Creating..." : "Create lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
