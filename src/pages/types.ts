export type LoadRequest
  = | { kind: 'file'; file: File }
    | { kind: 'files'; files: File[] }
    | { kind: 'url'; url: string; fileName: string }
    | { kind: 'urls'; items: { url: string; fileName: string }[] };
