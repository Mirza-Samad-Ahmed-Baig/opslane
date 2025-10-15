import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessions } from '@/hooks';
import { SessionCard } from './SessionCard';
import { EmptyState } from './EmptyState';

interface SessionListProps {
  onCreateClick: () => void;
}

export function SessionList({ onCreateClick }: SessionListProps) {
  const { data: sessions, isLoading, error, refetch } = useSessions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center gap-4">
        <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return <EmptyState onCreateClick={onCreateClick} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}
