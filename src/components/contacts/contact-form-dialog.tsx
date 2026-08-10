"use client";

import { useState, useTransition } from "react";
import {
  createContact,
  updateContact,
} from "@/lib/actions/contact-actions";
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
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

type ContactValues = {
  id?: string;
  firstName?: string;
  lastName?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  companyId?: string;
  isBillingContact?: boolean;
};

export function ContactFormDialog({
  contact,
  companies,
  fixedCompanyId,
}: {
  contact?: ContactValues;
  companies: { id: string; name: string }[];
  fixedCompanyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isEdit = !!contact?.id;
  const defaultCompanyId = fixedCompanyId ?? contact?.companyId;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = isEdit
        ? await updateContact(contact!.id!, formData)
        : await createContact(formData);
      if (result.ok) {
        toast.success(isEdit ? "Contact updated" : "Contact created");
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
          <Button variant="ghost" size="sm">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> New contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                name="firstName"
                required
                defaultValue={contact?.firstName ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                name="lastName"
                required
                defaultValue={contact?.lastName ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={contact?.title ?? ""}
              placeholder="Project Manager"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contact?.email ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(813) 555-0142"
                defaultValue={contact?.phone ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Company *</Label>
            {fixedCompanyId ? (
              <input type="hidden" name="companyId" value={fixedCompanyId} />
            ) : (
              <Select name="companyId" defaultValue={defaultCompanyId} required>
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
            {fixedCompanyId && (
              <p className="text-xs text-muted-foreground">
                Added to this company.
              </p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isBillingContact"
              defaultChecked={contact?.isBillingContact ?? false}
              className="h-4 w-4 rounded border-input"
            />
            Accounts-payable / billing contact
          </label>
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
