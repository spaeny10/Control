"use client";

import { useState, useTransition } from "react";
import { createUser, updateUser, setUserActive } from "@/lib/actions/user-actions";
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

type UserValues = {
  id?: string;
  name?: string;
  email?: string;
  role?: "ADMIN" | "MEMBER";
  isActive?: boolean;
};

export function UserFormDialog({ user }: { user?: UserValues }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isEdit = !!user?.id;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = isEdit
        ? await updateUser(user!.id!, formData)
        : await createUser(formData);
      if (result.ok) {
        toast.success(isEdit ? "User updated" : "User created");
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
            <Plus className="h-4 w-4" /> Add user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Add team member"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required defaultValue={user?.name ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select name="role" defaultValue={user?.role ?? "MEMBER"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              {isEdit ? "Reset password (leave blank to keep)" : "Temporary password *"}
            </Label>
            <Input
              id="password"
              name="password"
              type="text"
              minLength={10}
              required={!isEdit}
              placeholder="At least 10 characters"
            />
            <p className="text-xs text-muted-foreground">
              Share it with them securely; they can change it after signing in.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            {isEdit && user && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setUserActive(user.id!, !user.isActive);
                    if (result.ok) {
                      toast.success(user.isActive ? "User deactivated" : "User reactivated");
                      setOpen(false);
                    } else {
                      toast.error(result.error ?? "Failed");
                    }
                  })
                }
              >
                {user.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
