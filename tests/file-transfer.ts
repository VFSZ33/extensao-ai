import { vi } from "vitest";

export function stubFileTransfer(): void {
  const attached = new WeakMap<HTMLInputElement, File[]>();

  vi.stubGlobal(
    "DataTransfer",
    class {
      readonly files: FileList;
      readonly items: { add: (file: File) => void };

      constructor() {
        const files: File[] = [];
        this.files = toFileList(files);
        this.items = {
          add: (file) => {
            files.push(file);
          },
        };
      }
    },
  );
  vi.spyOn(HTMLInputElement.prototype, "files", "get").mockImplementation(
    function (this: HTMLInputElement) {
      return this.type === "file" ? toFileList(attached.get(this) ?? []) : null;
    },
  );
  vi.spyOn(HTMLInputElement.prototype, "files", "set").mockImplementation(
    function (this: HTMLInputElement, files: FileList | null) {
      attached.set(this, files ? Array.from(files) : []);
    },
  );
}

function toFileList(files: File[]): FileList {
  const list = {
    item: (index: number) => files[index] ?? null,
    get length() {
      return files.length;
    },
    [Symbol.iterator]: () => files[Symbol.iterator](),
  };

  return list as unknown as FileList;
}
