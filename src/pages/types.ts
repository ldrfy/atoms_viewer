export type LoadRequest =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string; fileName: string };
