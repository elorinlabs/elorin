import { t } from '../../i18n';
export type ViewerErrorCode =
  | "VIEWER_NOT_FOUND"
  | "LOAD_FAILED"
  | "PARSE_FAILED"
  | "UNSUPPORTED_CONTENT"
  | "OUT_OF_MEMORY"
  | "PERMISSION_DENIED"
  | "FILE_NOT_FOUND"
  | "READ_FAILED"
  | "SOURCE_CHANGED"
  | "SOURCE_CLOSED"
  | "INVALID_OFFSET"
  | "ABORTED";
export type ViewerDiagnosticCode='FORMAT_UNKNOWN'|'FORMAT_UNSUPPORTED'|'CODEC_UNSUPPORTED'|'SOURCE_UNAVAILABLE'|'PERMISSION_DENIED'|'SOURCE_CHANGED'|'FILE_CORRUPTED'|'INVALID_STRUCTURE'|'RESOURCE_LIMIT_EXCEEDED'|'DECODE_FAILED'|'RENDERER_UNAVAILABLE'|'OPERATION_CANCELLED'|'INTERNAL_ERROR';
export function viewerDiagnosticCode(error:unknown):ViewerDiagnosticCode {
  const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';
  const message=typeof error==='object'&&error&&'message' in error?String(error.message):String(error);
  if(['FORMAT_UNKNOWN','FORMAT_UNSUPPORTED','CODEC_UNSUPPORTED','SOURCE_UNAVAILABLE','PERMISSION_DENIED','SOURCE_CHANGED','FILE_CORRUPTED','INVALID_STRUCTURE','RESOURCE_LIMIT_EXCEEDED','DECODE_FAILED','RENDERER_UNAVAILABLE','OPERATION_CANCELLED','INTERNAL_ERROR'].includes(code))return code as ViewerDiagnosticCode;
  if(code==='ABORTED'||/\b(cancelled|canceled|abort)\b/i.test(message))return 'OPERATION_CANCELLED';
  if(/permission|access[_ ]denied/i.test(message))return 'PERMISSION_DENIED';
  if(/source[_ ]changed|revision.*differ/i.test(message))return 'SOURCE_CHANGED';
  if(code==='SOURCE_CLOSED'||code==='FILE_NOT_FOUND'||code==='READ_FAILED'||/source.*closed|file.*not found|source.?unavailable/i.test(message))return 'SOURCE_UNAVAILABLE';
  if(/missing external|missing companion/i.test(message))return 'SOURCE_UNAVAILABLE';
  if(code==='OPERATION_TIMEOUT'||code==='OUT_OF_MEMORY'||/budget|resource limit|safety limit|out of memory/i.test(message))return 'RESOURCE_LIMIT_EXCEEDED';
  if(/unsupported codec|codec.*(?:unsupported|unavailable)/i.test(message))return 'CODEC_UNSUPPORTED';
  if(/corrupt|truncat|damaged/i.test(message))return 'FILE_CORRUPTED';
  if(code==='PARSE_FAILED'||code==='INVALID_OFFSET'||/invalid.*(?:structure|header|offset)/i.test(message))return 'INVALID_STRUCTURE';
  if(/renderer unavailable|webgl.*unavailable/i.test(message))return 'RENDERER_UNAVAILABLE';
  if(/decode/i.test(message))return 'DECODE_FAILED';
  if(code==='UNSUPPORTED_CONTENT'||/unsupported/i.test(message))return 'FORMAT_UNSUPPORTED';
  if(code==='VIEWER_NOT_FOUND'||/not recognized|unknown format/i.test(message))return 'FORMAT_UNKNOWN';
  return 'INTERNAL_ERROR';
}
export const viewerErrorMessages:Record<ViewerDiagnosticCode,string>={FORMAT_UNKNOWN:'未能识别文件格式，可尝试以 Hex 查看原始内容。',FORMAT_UNSUPPORTED:'已识别格式，但当前查看器不支持此内容。',CODEC_UNSUPPORTED:'当前系统不支持此编码，容器识别不代表可播放。',SOURCE_UNAVAILABLE:'文件源不可访问或已关闭，请重新打开文件。',PERMISSION_DENIED:'没有读取权限，请检查授权后重新打开。',SOURCE_CHANGED:'读取期间文件发生变化，请重新打开以获取当前内容。',FILE_CORRUPTED:'文件内容损坏或不完整，可查看原始内容。',INVALID_STRUCTURE:'文件结构或数据范围无效，无法安全解析。',RESOURCE_LIMIT_EXCEEDED:'读取或解码达到安全预算，已停止等待。',DECODE_FAILED:'内容解码失败，可重试或选择其他查看方式。',RENDERER_UNAVAILABLE:'当前环境无法创建所需渲染器。',OPERATION_CANCELLED:'操作已取消。',INTERNAL_ERROR:'查看器发生异常，可重试或选择其他查看方式。'};
export class ViewerError extends Error {
  get diagnosticCode():ViewerDiagnosticCode{return viewerDiagnosticCode(this);}
  get userMessage():string{return t(viewerErrorMessages[this.diagnosticCode]);}
  get category(): ViewerFailureCategory { return classifyViewerFailure(this); }
  constructor(
    public readonly code: ViewerErrorCode | ViewerDiagnosticCode | 'OPERATION_TIMEOUT',
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ViewerError";
  }
  static from(error: unknown): ViewerError {
    if (error instanceof ViewerError) return error;
    if (error instanceof DOMException && error.name === "AbortError")
      return new ViewerError("ABORTED", "Loading was cancelled.");
    if (error instanceof SyntaxError) return new ViewerError('PARSE_FAILED', error.message, error);
    if (typeof error === 'object' && error && 'code' in error && ['FILE_NOT_FOUND','READ_FAILED','SOURCE_CHANGED','SOURCE_CLOSED','INVALID_OFFSET','ABORTED','OUT_OF_MEMORY','UNSUPPORTED_CONTENT','LOAD_FAILED','PARSE_FAILED','VIEWER_NOT_FOUND'].includes(String(error.code)))
      return new ViewerError(error.code as ViewerErrorCode, 'message' in error ? String(error.message) : 'Binary source is unavailable.', error);
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "PERMISSION_DENIED"
    )
      return new ViewerError(
        "PERMISSION_DENIED",
        'message' in error ? String(error.message) : "Permission to read this file was denied.",
        error,
      );
    if(typeof error==='object'&&error&&'code' in error&&['FORMAT_UNKNOWN','FORMAT_UNSUPPORTED','CODEC_UNSUPPORTED','SOURCE_UNAVAILABLE','FILE_CORRUPTED','INVALID_STRUCTURE','RESOURCE_LIMIT_EXCEEDED','DECODE_FAILED','RENDERER_UNAVAILABLE','OPERATION_CANCELLED','INTERNAL_ERROR','OPERATION_TIMEOUT'].includes(String(error.code)))return new ViewerError(error.code as ViewerDiagnosticCode,'message' in error?String(error.message):String(error.code),error);
    if(error instanceof Error)return new ViewerError(/budget|resource limit|safety limit|out of memory/i.test(error.message)?'OUT_OF_MEMORY':/unsupported/i.test(error.message)?'UNSUPPORTED_CONTENT':'LOAD_FAILED',error.message,error);
    return new ViewerError(
      "LOAD_FAILED",
      "This file could not be loaded. Try again or use the text fallback.",
      error,
    );
  }
}
export type ViewerFailureCategory = 'NotRecognized' | 'RecognizedButUnsupported' | 'CodecUnsupported' | 'MissingExternalResource' | 'CorruptedFile' | 'InvalidStructure' | 'ResourceLimitExceeded' | 'PermissionDenied' | 'Cancelled' | 'SourceChanged' | 'DecodeFailure' | 'RendererUnavailable';
/** Common diagnostic vocabulary; original errors and IPC codes remain intact. */
export function classifyViewerFailure(error: unknown): ViewerFailureCategory {
  const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';
  const message=error instanceof Error?error.message:String(error);
  if(code==='ABORTED'||/abort|cancel/i.test(message))return 'Cancelled';
  if(code==='PERMISSION_DENIED'||/permission|access denied/i.test(message))return 'PermissionDenied';
  if(code==='SOURCE_CHANGED'||code==='SOURCE_CLOSED'||/source changed|source closed/i.test(message))return 'SourceChanged';
  if(/missing external|missing companion/i.test(message))return 'MissingExternalResource';
  if(/codec/i.test(message))return 'CodecUnsupported';
  if(code==='OUT_OF_MEMORY'||/resource limit|budget|out of memory/i.test(message))return 'ResourceLimitExceeded';
  if(/corrupt|truncat|damaged/i.test(message))return 'CorruptedFile';
  if(code==='PARSE_FAILED'||/invalid structure|invalid.*header/i.test(message))return 'InvalidStructure';
  if(/renderer unavailable|webgl.*unavailable/i.test(message))return 'RendererUnavailable';
  if(/decode/i.test(message))return 'DecodeFailure';
  if(code==='UNSUPPORTED_CONTENT'||/unsupported/i.test(message))return 'RecognizedButUnsupported';
  if(code==='VIEWER_NOT_FOUND'||/not recognized|unknown format/i.test(message))return 'NotRecognized';
  return 'DecodeFailure';
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new ViewerError("ABORTED", "Loading was cancelled.");
}
