import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Orbit,
  Search,
  Settings,
  ExternalLink,
  LogOut,
  Tag,
  BookOpen,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SavedReel, KeyTakeaway } from "@orbit/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useReels() {
  const [reels, setReels] = useState<SavedReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("saved_reels")
        .select(
          "id, user_id, original_url, title, summary, category, tags, key_takeaways, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReels((data as SavedReel[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReels();
  }, [fetchReels]);

  return { reels, loading, error, refetch: fetchReels };
}

// ─────────────────────────────────────────────────────────────────────────────
// ReelCard component
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
      {category}
    </span>
  );
}

function ReelCard({ reel }: { reel: SavedReel }) {
  const [expanded, setExpanded] = useState(false);
  const takeaways = reel.key_takeaways as KeyTakeaway[];
  const formattedDate = new Date(reel.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card className="glass transition-all duration-200 hover:border-primary/30 hover:glow-primary animate-slide-up">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <CategoryBadge category={reel.category} />
              <span className="text-xs text-muted-foreground">{formattedDate}</span>
            </div>
            <CardTitle className="text-base leading-snug line-clamp-2">
              {reel.title}
            </CardTitle>
          </div>
          <a
            href={reel.original_url}
            target="_blank"
            rel="noopener noreferrer"
            id={`view-original-${reel.id}`}
            className="shrink-0 mt-1 flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/20 hover:bg-primary/20 transition-colors"
            aria-label="View original reel"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {reel.summary}
        </p>

        {/* Tags */}
        {reel.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
            {reel.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Key Takeaways — collapsible */}
        {takeaways.length > 0 && (
          <div>
            <button
              id={`toggle-takeaways-${reel.id}`}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {expanded ? "Hide" : "Show"} {takeaways.length} key takeaway
              {takeaways.length !== 1 ? "s" : ""}
            </button>

            {expanded && (
              <ul className="mt-3 space-y-2.5 animate-slide-up">
                {takeaways.map((t, i) => (
                  <li key={i} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-semibold text-foreground mb-0.5">
                      {t.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { reels, loading, error } = useReels();
  const [query, setQuery] = useState("");

  const filteredReels = reels.filter(
    (r) =>
      !query ||
      r.title.toLowerCase().includes(query.toLowerCase()) ||
      r.summary.toLowerCase().includes(query.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())) ||
      r.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 glass border-b border-border/40">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Orbit className="h-5 w-5 text-primary" />
            <span className="font-bold text-gradient">Orbit</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/settings" id="settings-link">
              <Button variant="ghost" size="icon" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              id="sign-out-btn"
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            Your Reels
            {reels.length > 0 && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({reels.length})
              </span>
            )}
          </h1>
          {user?.email && (
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          )}
        </div>

        {/* ── Search ── */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search-input"
            placeholder="Search by title, tag, category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredReels.length === 0 ? (
          <EmptyState hasQuery={Boolean(query)} />
        ) : (
          <div className="space-y-4">
            {filteredReels.map((reel) => (
              <ReelCard key={reel.id} reel={reel} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
        <Orbit className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">
          {hasQuery ? "No matching reels" : "Your library is empty"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasQuery
            ? "Try a different search term."
            : "Share a Reel from your iPhone using the Orbit Shortcut."}
        </p>
      </div>
    </div>
  );
}
