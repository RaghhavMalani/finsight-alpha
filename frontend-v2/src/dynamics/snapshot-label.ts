import { createContext, useContext } from "react";

const SnapshotLabel = createContext("");
export const SnapshotLabelProvider = SnapshotLabel.Provider;
export function useSnapshotLabel(name: string) {
  const prefix = useContext(SnapshotLabel);
  return prefix ? `${prefix} / ${name}` : name;
}
