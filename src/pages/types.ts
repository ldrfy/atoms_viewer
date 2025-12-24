export type LoadRequest =
  | { kind: "file"; file: File }
  | { kind: "text"; text: string; fileName: string };
