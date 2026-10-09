export function scientificError(error: unknown) {
  const object = error as { code?: string; message?: string } | undefined;
  const message = error instanceof Error ? error.message : object?.message ?? String(error);
  const evidence = `${object?.code ?? ''} ${message}`;
  const code = /cancel|stale|paused/i.test(evidence) ? 'Cancelled'
    : /permission|access_denied|not_granted|unauthoriz/i.test(evidence) ? 'PermissionDenied'
    : /source_closed|not_found|source_changed|read_failed|range read failed/i.test(evidence) ? 'SourceUnavailable'
    : /codec|unsupported.*compress|unsupported HDF5 filter/i.test(evidence) ? 'MissingCodec'
    : /safety limit|resource.?limit|budget|timeout|materialization/i.test(evidence) ? 'ResourceLimit'
    : /unsupported.*format/i.test(evidence) ? 'UnsupportedFormat'
    : /unsupported|blocked|variable-length/i.test(evidence) ? 'UnsupportedFeature'
    : 'Corrupted';
  return `${code}: ${message}${object?.code ? ` [${object.code}]` : ''}`;
}
