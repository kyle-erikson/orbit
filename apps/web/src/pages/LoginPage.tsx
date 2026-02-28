import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Orbit } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Background decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo + Brand */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30 glow-primary">
            <Orbit className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gradient">Orbit</h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Save &amp; summarize your Reels with AI.
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="glass rounded-2xl p-8">
          <h2 className="mb-1 text-xl font-semibold">Welcome back</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Sign in to access your personal Reel library.
          </p>

          <Button
            id="google-login-btn"
            onClick={signInWithGoogle}
            className="w-full gap-3 h-12 text-base"
            disabled={loading}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <span className="underline cursor-pointer">Terms of Service</span> and{" "}
            <span className="underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>

        {/* Feature list */}
        <ul className="mt-8 flex flex-col gap-3 text-sm text-muted-foreground">
          {[
            "📱  Share any Reel via iOS Shortcut — zero friction",
            "🤖  AI-powered summaries &amp; key takeaways (Gemini 1.5 Pro)",
            "🔍  Semantic search across your entire library",
          ].map((feature) => (
            <li key={feature} dangerouslySetInnerHTML={{ __html: feature }} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
