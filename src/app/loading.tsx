export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    </div>
  );
}
