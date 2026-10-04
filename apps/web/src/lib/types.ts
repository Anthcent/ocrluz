export type Engine = 'ocrspace' | 'gemini' | 'tesseract';
export type ScanEngine = Engine | 'manual';
export type GroupColor = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'yellow';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface KeyStatus {
  configured: boolean;
  source: 'user' | 'server' | 'none';
  masked: string;
}

export interface Settings {
  defaultEngine: Engine;
  ocrLanguage: string;
  autoScan: boolean;
  geminiModel: string;
  keys: { ocrspace: KeyStatus; gemini: KeyStatus };
}

export interface Group {
  id: number;
  title: string;
  description: string;
  /** Responsable de la carpeta (la columna conserva el nombre «author»). */
  author: string;
  category: string;
  color: GroupColor;
  /** Hojas esperadas en la carpeta (opcional), para mostrar el avance. */
  totalPages: number | null;
  createdAt: string;
  updatedAt: string;
  scanCount?: number;
  wordCount?: number;
}

export interface Scan {
  id: number;
  groupId: number | null;
  groupTitle?: string | null;
  groupColor?: GroupColor | null;
  title: string;
  text: string;
  engine: ScanEngine;
  language: string;
  position: number;
  wordCount: number;
  /** Número de página impreso detectado en la hoja («23», «xii»…); vacío si no se detectó. */
  pageLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  id: number;
  title: string;
  groupId: number | null;
  groupTitle: string | null;
  groupColor: GroupColor | null;
  groupAuthor: string | null;
  groupCategory: string | null;
  position: number;
  pageLabel: string;
  wordCount: number;
  createdAt: string;
  snippet: string;
}

export interface Stats {
  totals: { scans: number; words: number; individual: number; groups: number };
  week: { day: string; count: number }[];
  recentGroups: (Pick<Group, 'id' | 'title' | 'author' | 'category' | 'color' | 'totalPages' | 'updatedAt'> & { scanCount: number })[];
}

export interface Analysis<T = unknown> {
  id: number;
  targetType: 'group' | 'scan';
  targetId: number;
  mode: 'online' | 'offline';
  content: T;
  createdAt: string;
}

/**
 * Análisis con IA de un documento. Los análisis guardados con el formato anterior
 * (temas, ideasClave, vocabulario, preguntas, tono) se siguen mostrando: todo es opcional.
 */
export interface OnlineAnalysisContent {
  resumen?: string;
  tipoDocumento?: string;
  datosClave?: { dato: string; valor: string }[];
  entidades?: { nombre: string; tipo: string }[];
  observaciones?: string[];
  calidadOcr?: string;
  truncated?: boolean;
  /** Formato anterior. */
  temas?: string[];
  ideasClave?: string[];
  vocabulario?: { termino: string; definicion: string }[];
  preguntas?: string[];
  tono?: string;
}

/** Datos editables de un grupo (carpeta). */
export type GroupInput = Pick<Group, 'title' | 'description' | 'author' | 'category' | 'color' | 'totalPages'>;

export interface DocField {
  key: string;
  label: string;
  type: import('./doc-templates').FieldType;
  value: string;
}

export interface SavedDocument {
  id: number;
  templateKey: string;
  templateName: string;
  title: string;
  fields: DocField[];
  text: string;
  engine: ScanEngine;
  /** Cómo se extrajeron los datos: con IA, con reglas en el dispositivo o a mano. */
  method: 'ai' | 'rules' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface CustomTemplate {
  id: number;
  name: string;
  emoji: string;
  fields: { key: string; label: string; type: import('./doc-templates').FieldType }[];
  createdAt: string;
}
