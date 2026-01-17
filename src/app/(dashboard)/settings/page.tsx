"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Cloud, Github } from "lucide-react";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.settings.get.useQuery();

  const [cloudflareToken, setCloudflareToken] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    zones?: Array<{ id: string; name: string }>;
    error?: string;
  } | null>(null);

  const validateCloudflare = trpc.settings.validateCloudflare.useMutation({
    onSuccess: (result) => {
      setValidationResult(result);
      if (result.valid && result.zones && result.zones.length > 0) {
        setSelectedZone(result.zones[0].id);
      }
    },
  });

  const updateCloudflare = trpc.settings.updateCloudflare.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setCloudflareToken("");
      setValidationResult(null);
    },
  });

  const removeCloudflare = trpc.settings.updateCloudflare.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and integrations
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub Account
            </CardTitle>
            <CardDescription>
              Your connected GitHub account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <p className="font-medium">{settings?.name || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">{settings?.email}</p>
                {settings?.githubUsername && (
                  <p className="text-sm text-muted-foreground">
                    @{settings.githubUsername}
                  </p>
                )}
              </div>
              <Badge variant="success">Connected</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Cloudflare Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Cloudflare Integration
            </CardTitle>
            <CardDescription>
              Connect Cloudflare for automatic DNS management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings?.hasCloudflareToken ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Cloudflare Connected</p>
                    {settings.cloudflareZone && (
                      <p className="text-sm text-muted-foreground">
                        Zone: {settings.cloudflareZone}
                      </p>
                    )}
                  </div>
                  <Badge variant="success">Connected</Badge>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => removeCloudflare.mutate({ remove: true })}
                  disabled={removeCloudflare.isPending}
                >
                  {removeCloudflare.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">API Token</Label>
                  <Input
                    id="token"
                    type="password"
                    value={cloudflareToken}
                    onChange={(e) => setCloudflareToken(e.target.value)}
                    placeholder="Enter your Cloudflare API token"
                  />
                  <p className="text-xs text-muted-foreground">
                    Create a token with Zone:DNS:Edit permissions at{" "}
                    <a
                      href="https://dash.cloudflare.com/profile/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Cloudflare Dashboard
                    </a>
                  </p>
                </div>

                {!validationResult && (
                  <Button
                    onClick={() => validateCloudflare.mutate({ token: cloudflareToken })}
                    disabled={!cloudflareToken || validateCloudflare.isPending}
                  >
                    {validateCloudflare.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Validate Token
                  </Button>
                )}

                {validationResult && (
                  <div className="space-y-4">
                    {validationResult.valid ? (
                      <>
                        <div className="flex items-center gap-2 text-green-500">
                          <Check className="h-4 w-4" />
                          Token is valid
                        </div>

                        {validationResult.zones && validationResult.zones.length > 0 && (
                          <div className="space-y-2">
                            <Label>Select Zone</Label>
                            <Select value={selectedZone} onValueChange={setSelectedZone}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a zone" />
                              </SelectTrigger>
                              <SelectContent>
                                {validationResult.zones.map((zone) => (
                                  <SelectItem key={zone.id} value={zone.id}>
                                    {zone.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <Button
                          onClick={() =>
                            updateCloudflare.mutate({
                              token: cloudflareToken,
                              zoneId: selectedZone,
                            })
                          }
                          disabled={!selectedZone || updateCloudflare.isPending}
                        >
                          {updateCloudflare.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Save Configuration
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-destructive">
                        <X className="h-4 w-4" />
                        {validationResult.error || "Invalid token"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
