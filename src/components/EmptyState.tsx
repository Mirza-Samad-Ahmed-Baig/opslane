import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onCreateClick: () => void;
}

export function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] text-center">
      <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">No sessions yet</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        Create your first session to get started with isolated development environments.
      </p>
      <Button variant="link" onClick={onCreateClick}>
        Create your first session →
      </Button>
    </div>
  );
}
