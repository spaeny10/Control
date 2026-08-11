"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLead, updateLead } from "@/lib/actions/lead-actions";
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
import { Pencil, Plus } from "lucide-react";

export type LeadFormData = {
  id: string;
  title: string;
  type: "NEW_COMPANY" | "NEW_PROJECT";
  companyId: string | null;
  contactId: string | null;
  ownerId: string | null;
  estMrr: number | null;
  estMonths: number | null;
  estValue: number | null;
  source: string | null;
  expectedClose: Date | null;
};

export function LeadFormDialog({
  companies,
  contacts,
  users,
  lead,
  presetType,
  presetCompanyId,
  sourceLeadId,
  triggerLabel,
}: {
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; companyId: string }[];
  users?: { id: string; name: string }[];
  lead?: LeadFormData;
  /** Locks the track and hides the type tabs (used by the spawn flow). */
  presetType?: "NEW_COMPANY" | "NEW_PROJECT";
  presetCompanyId?: string;
  /** The organization lead this project lead is being spawned from. */
  sourceLeadId?: string;
  triggerLabel?: string;
}) {
  const isEdit = !!lead;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(lead?.title ?? "");
  const [type, setType] = useState<"NEW_COMPANY" | "NEW_PROJECT">(
    presetType ?? lead?.type ?? "NEW_COMPANY"
  );
  const [companyId, setCompanyId] = useState<string>(
    presetCompanyId ?? lead?.companyId ?? ""
  );
  const [contactId, setContactId] = useState<string>(lead?.contactId ?? "");
  const [ownerId, setOwnerId] = useState<string>(lead?.ownerId ?? "");
  const [estMrr, setEstMrr] = useState(
    lead?.estMrr != null ? String(lead.estMrr) : ""
  );
  const [estMonths, setEstMonths] = useState(
    lead?.estMonths != null ? String(lead.estMonths) : ""
  );
  const [estValue, setEstValue] = useState(
    lead?.estValue != null ? String(lead.estValue) : ""
  );
  const [source, setSource] = useState(lead?.source ?? "");
  const [expectedClose, setExpectedClose] = useState(
    lead?.expectedClose
      ? new Date(lead.expectedClose).toISOString().split("T")[0]
      : ""
  );
  const [totalEdited, setTotalEdited] = useState(isEdit && lead?.estValue != null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setTitle(lead?.title ?? "");
      setType(presetType ?? lead?.type ?? "NEW_COMPANY");
      setCompanyId(presetCompanyId ?? lead?.companyId ?? "");
      setContactId(lead?.contactId ?? "");
      setOwnerId(lead?.ownerId ?? "");
      setEstMrr(lead?.estMrr != null ? String(lead.estMrr) : "");
      setEstMonths(lead?.estMonths != null ? String(lead.estMonths) : "");
      setEstValue(lead?.estValue != null ? String(lead.estValue) : "");
      setSource(lead?.source ?? "");
      setExpectedClose(
        lead?.expectedClose
          ? new Date(lead.expectedClose).toISOString().split("T")[0]
          : ""
      );
      setTotalEdited(isEdit && lead?.estValue != null);
    }
  }, [open, lead]);

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

  // Organization leads carry no economics; make sure stale state can't leak
  // values into the submission after a track switch.
  const showMoney = type === "NEW_PROJECT";

  function handleSubmit(formData: FormData) {
    formData.set("type", type);
    if (ownerId) formData.set("ownerId", ownerId);
    if (sourceLeadId) formData.set("sourceLeadId", sourceLeadId);
    if (!showMoney) {
      formData.delete("estMrr");
      formData.delete("estMonths");
      formData.delete("estValue");
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateLead(lead!.id, formData)
        : await createLead(formData);
      if (result.ok) {
        toast.success(isEdit ? "Lead updated" : "Lead created");
        setOpen(false);
        if (!isEdit && result.id) router.push(`/leads/${result.id}`);
        if (isEdit) router.refresh();
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
        ) : presetType ? (
          <Button variant="outline" size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" /> {triggerLabel ?? "New lead"}
          </Button>
        ) : (
          <Button className="gap-1">
            <Plus className="h-4 w-4" /> New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit lead"
              : presetType === "NEW_PROJECT"
                ? "New project lead"
                : "New lead"}
          </DialogTitle>
        </DialogHeader>

        {!isEdit && !presetType && (
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
        )}

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Lead title *</Label>
            <Input
              id="title"
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              onValueChange={(v) => {
                setCompanyId(v);
                setContactId("");
              }}
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
            {!isEdit && type === "NEW_COMPANY" && (
              <p className="text-xs text-muted-foreground">
                Create the company first under Companies if it isn&apos;t
                listed, or leave blank for now.
              </p>
            )}
          </div>

          {!isEdit && type === "NEW_PROJECT" && (
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
              <Select
                name="contactId"
                value={contactId}
                onValueChange={setContactId}
              >
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

          {users && users.length > 0 && (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Money is project-track only. An organization lead has no job
              behind it yet, so any figure here would be fiction. */}
          {showMoney ? (
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
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Organization leads track the relationship, not a job — so they
              carry no revenue estimate. When a real project surfaces, spawn a
              project lead from this one and forecast it there.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Referral"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedClose">Expected close</Label>
              <Input
                id="expectedClose"
                name="expectedClose"
                type="date"
                value={expectedClose}
                onChange={(e) => setExpectedClose(e.target.value)}
              />
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
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save changes"
                  : "Create lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
