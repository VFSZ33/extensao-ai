import { useEffect, useState } from "react";

import {
  AUTO_REFRESH_DEFAULT,
  readAutoRefresh,
  saveAutoRefresh,
  watchAutoRefresh,
} from "@/lib/preferences";

export type AutoRefreshPreference = {
  enabled: boolean | undefined;
  save: (enabled: boolean) => Promise<void>;
};

export function useAutoRefreshPreference(): AutoRefreshPreference {
  const [enabled, setEnabled] = useState<boolean>();

  useEffect(() => {
    let active = true;
    const unwatch = watchAutoRefresh((value) => {
      if (active) {
        setEnabled(value);
      }
    });

    void readAutoRefresh().then(
      (value) => {
        if (active) {
          setEnabled(value);
        }
      },
      () => {
        if (active) {
          setEnabled(AUTO_REFRESH_DEFAULT);
        }
      },
    );

    return () => {
      active = false;
      unwatch();
    };
  }, []);

  async function save(value: boolean) {
    const previous = enabled;
    setEnabled(value);

    try {
      await saveAutoRefresh(value);
    } catch (error) {
      setEnabled(previous);
      throw error;
    }
  }

  return { enabled, save };
}
