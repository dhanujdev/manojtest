declare const chrome:
  | {
      runtime?: {
        onInstalled?: {
          addListener: (listener: () => void) => void;
        };
      };
      tabs?: {
        query: (
          queryInfo: { active: boolean; currentWindow: boolean },
          callback: (tabs: Array<{ url?: string }>) => void
        ) => void;
      };
    }
  | undefined;
