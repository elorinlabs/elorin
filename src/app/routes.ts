import { t as tr } from "../i18n";
import { Home, Clock3, FileText, Code2, Table2, Image, Folder, Archive, Star, Presentation, Play, Box } from 'lucide-react';
export const primaryRoutes = [
  { id: 'home', get label() { return tr("Home"); }, icon: Home },
  { id: 'library', get label() { return tr("All Files"); }, icon: Folder },
  { id: 'recents', get label() { return tr("Recent"); }, icon: Clock3 },
  { id: 'favorites', get label() { return tr("Favorites"); }, icon: Star },
] as const;
export const libraryRoutes = [
  { id: 'documents', get label() { return tr("Documents"); }, icon: FileText, formats: 'PDF, DOCX, ODT, RTF' },
  { id: 'images', get label() { return tr("Images"); }, icon: Image, formats: 'PNG, JPEG, WEBP, SVG' },
  { id: 'code', get label() { return tr("Text & Code"); }, icon: Code2, formats: 'Text, Markdown, JSON, source code' },
  { id: 'data', get label() { return tr("Spreadsheets"); }, icon: Table2, formats: 'CSV, XLSX, ODS, scientific data' },
  { id: 'presentations', get label() { return tr("Presentations"); }, icon: Presentation, formats: 'PPTX, ODP' },
  { id: 'media', get label() { return tr("Media"); }, icon: Play, formats: 'Video, audio, subtitles' },
  { id: 'geometry', label: '3D / CAD', icon: Box, formats: 'GLB, OBJ, STL, STEP, DXF' },
  { id: 'archives', get label() { return tr("Archives"); }, icon: Archive, formats: 'ZIP, TAR, 7Z and available backends' },
] as const;
export type RouteId = (typeof primaryRoutes)[number]['id'] | (typeof libraryRoutes)[number]['id'] | 'settings';
