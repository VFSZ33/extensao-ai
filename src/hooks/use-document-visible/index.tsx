import { useSyncExternalStore } from "react";

export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, readVisible, readVisible);
}

function readVisible(): boolean {
  return document.visibilityState === "visible";
}

function subscribe(callback: () => void): () => void {
  document.addEventListener("visibilitychange", callback);

  return () => {
    document.removeEventListener("visibilitychange", callback);
  };
}
