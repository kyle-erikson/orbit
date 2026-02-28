import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Orbit,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string;

/**
 * Generate a cryptographically random token and its SHA-256 hex digest.
 * The raw token is shown to the user exactly once. Only the hash is sent to
 * the server and stored in Supabase.
 */
async function generateTokenAndHash(): Promise<{ raw: string; hash: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const raw = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return { raw, hash };
}

export function SettingsPage() {
  const { session, signOut } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerateToken() {
    if (!session?.access_token) {
      toast({ title: "Not authenticated", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setGeneratedToken(null);
    setVisible(false);
    setCopied(false);

    try {
      const { raw, hash } = await generateTokenAndHash();

      const res = await fetch(`${WORKER_URL}/api/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ key_hash: hash }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }

      setGeneratedToken(raw);
      toast({
        title: "Token generated!",
        description: "Copy it now — it won't be shown again.",
      });
    } catch (e) {
      toast({
        title: "Failed to generate token",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!generatedToken) return;
    await navigator.clipboard.writeText(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 glass border-b border-border/40">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link to="/dashboard" id="back-to-dashboard-link">
            <Button variant="ghost" size="icon" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Orbit className="h-5 w-5 text-primary" />
            <span className="font-bold text-gradient">Settings</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* ── iOS Shortcut Token Card ── */}
        <Card className="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>iOS Shortcut Token</CardTitle>
            </div>
            <CardDescription>
              Generate a Bearer token for the Orbit iOS Shortcut. The raw token
              is shown{" "}
              <strong className="text-foreground">exactly once</strong> — store
              it in your Shortcut immediately. We only ever store a SHA-256 hash.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Security notice */}
            <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3 text-sm">
              <Shield className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <p className="text-muted-foreground leading-relaxed">
                Your token authenticates Reel submissions from your iPhone. Keep
                it secret. Generating a new token does not invalidate previous
                ones — delete old tokens from your Supabase dashboard if needed.
              </p>
            </div>

            {/* Generated token display */}
            {generatedToken ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-primary uppercase tracking-wider">
                  Your Bearer Token (copy now!)
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg bg-muted border border-border p-3 font-mono text-xs break-all overflow-hidden">
                    {visible ? generatedToken : "•".repeat(generatedToken.length)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      id="toggle-token-visibility"
                      variant="outline"
                      size="icon"
                      onClick={() => setVisible((v) => !v)}
                      aria-label={visible ? "Hide token" : "Show token"}
                    >
                      {visible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      id="copy-token-btn"
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      aria-label="Copy token"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ This is the only time this token will be displayed.
                </p>
              </div>
            ) : null}

            <Button
              id="generate-token-btn"
              onClick={handleGenerateToken}
              disabled={generating}
              className="w-full gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  Generate iOS Shortcut Token
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Account ── */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Signed in as{" "}
              <strong className="text-foreground">
                {session?.user?.email ?? "—"}
              </strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              id="sign-out-settings-btn"
              variant="outline"
              onClick={signOut}
              className="gap-2"
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
