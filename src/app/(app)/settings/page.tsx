import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { UserFormDialog } from "@/components/settings/user-form-dialog";
import { ProductFormDialog } from "@/components/settings/product-form-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const [users, products] = await Promise.all([
    isAdmin
      ? prisma.user.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.planProduct.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Your account, team, and price catalog
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">My account</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="catalog">Price catalog</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
              <CardDescription>
                Signed in as {session?.user?.email}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="team">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team members</CardTitle>
                  <CardDescription>
                    Admins manage everything; members can&apos;t manage the team
                    or catalog.
                  </CardDescription>
                </div>
                <UserFormDialog />
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {u.name}
                          {u.id === session?.user?.id && (
                            <span className="text-muted-foreground"> (you)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!u.isActive && (
                          <Badge variant="outline">Deactivated</Badge>
                        )}
                        <Badge
                          variant={u.role === "ADMIN" ? "default" : "secondary"}
                        >
                          {u.role}
                        </Badge>
                        <UserFormDialog
                          user={{
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            role: u.role,
                            isActive: u.isActive,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="catalog">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Price catalog</CardTitle>
                <CardDescription>
                  Reusable line items for quotes. Archived items stay on old
                  quotes but disappear from the picker.
                </CardDescription>
              </div>
              {isAdmin && <ProductFormDialog />}
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.description ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!p.isActive && <Badge variant="outline">Archived</Badge>}
                      <Badge variant="secondary">
                        {formatCurrency(Number(p.unitPrice))}
                        {p.kind === "RECURRING_MONTHLY" ? "/mo" : ""}
                      </Badge>
                      {isAdmin && (
                        <ProductFormDialog
                          product={{ ...p, unitPrice: Number(p.unitPrice) }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integrations</CardTitle>
              <CardDescription>
                Status is read from the server environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { name: "Stripe billing", on: !!process.env.STRIPE_SECRET_KEY },
                {
                  name: "Stripe webhooks",
                  on: !!process.env.STRIPE_WEBHOOK_SECRET,
                },
                { name: "SendGrid email", on: !!process.env.SENDGRID_API_KEY },
                { name: "Twilio SMS", on: !!process.env.TWILIO_ACCOUNT_SID },
              ].map((i) => (
                <div
                  key={i.name}
                  className="flex items-center justify-between py-1"
                >
                  <span>{i.name}</span>
                  <Badge variant={i.on ? "default" : "outline"}>
                    {i.on ? "Connected" : "Not configured"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
