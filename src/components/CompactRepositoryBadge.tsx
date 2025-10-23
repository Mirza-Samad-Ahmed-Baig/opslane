import { useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import type { Project } from '@/types/project';

interface CompactRepositoryBadgeProps {
  selectedProject: Project | null;
  projects: Project[] | undefined;
  isBrowsing: boolean;
  isPending: boolean;
  onProjectSelect: (project: Project) => void;
  onBrowseFolder: () => void;
}

export function CompactRepositoryBadge({
  selectedProject,
  projects,
  isBrowsing,
  isPending,
  onProjectSelect,
  onBrowseFolder,
}: CompactRepositoryBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Select
      value={selectedProject?.id || ''}
      onValueChange={(value) => {
        if (value === '__browse__') {
          onBrowseFolder();
        } else if (value) {
          const project = projects?.find((p) => p.id === value);
          if (project) {
            onProjectSelect(project);
          }
        }
        setIsOpen(false);
      }}
      disabled={isBrowsing || isPending}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <SelectTrigger
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 rounded-md border border-border/50 text-sm h-auto w-auto transition-all duration-150 hover:bg-muted/70 hover:border-border hover:scale-[1.02]"
        aria-label={selectedProject ? `Repository: ${selectedProject.name}` : 'Select repository'}
      >
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        {selectedProject && (
          <span className="font-medium truncate max-w-[200px]">{selectedProject.name}</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {projects && projects.length > 0 && (
          <>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
            <SelectSeparator />
          </>
        )}
        <SelectItem value="__browse__" disabled={isBrowsing}>
          {isBrowsing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Browsing...
            </span>
          ) : (
            'Browse for new project...'
          )}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
