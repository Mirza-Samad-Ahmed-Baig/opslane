import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface GitUser {
  name: string;
  email: string;
}

interface CommitResult {
  commitHash: string;
  filesChanged: number;
  success: boolean;
}

export function useGitCommands(sessionId: string, projectId: string) {
  const [gitUser, setGitUser] = useState<GitUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Fetch git user config
  const fetchGitUser = useCallback(async () => {
    setIsLoadingUser(true);
    try {
      const user = await invoke<GitUser>('get_git_user_config', {
        request: { projectId },
      });
      setGitUser(user);
      return user;
    } catch (error) {
      const errorMsg = error as string;
      toast.error('Git Configuration Required', {
        description: errorMsg,
        duration: 8000,
      });
      throw error;
    } finally {
      setIsLoadingUser(false);
    }
  }, [projectId]);

  // Commit changes to local
  const commitToLocal = useCallback(
    async (commitMessage: string) => {
      setIsCommitting(true);
      try {
        const result = await invoke<CommitResult>('commit_session_to_local', {
          request: {
            sessionId,
            commitMessage,
          },
        });

        toast.success('Committed to Local', {
          description: `Created commit ${result.commitHash.substring(0, 7)} with ${result.filesChanged} files`,
        });

        return result;
      } catch (error) {
        const errorMsg = error as string;
        toast.error('Commit Failed', {
          description: errorMsg,
          duration: 8000,
        });
        throw error;
      } finally {
        setIsCommitting(false);
      }
    },
    [sessionId]
  );

  return {
    gitUser,
    isLoadingUser,
    isCommitting,
    fetchGitUser,
    commitToLocal,
  };
}
