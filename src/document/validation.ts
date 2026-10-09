import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser';
export interface DocumentDiagnostic { line: number; column: number; message: string; severity: 'error' | 'warning' | 'info' }
export interface DocumentValidator { validate(text: string): DocumentDiagnostic | null }
export const jsonValidator: DocumentValidator = {
  validate(text) {
    const errors: ParseError[] = [];
    parse(text, errors, { allowTrailingComma: false, disallowComments: true });
    if (!errors.length) return null;
    const error = errors[0], before = text.slice(0, error.offset);
    return { line: before.split(/\r\n|\r|\n/).length, column: before.length - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')), message: printParseErrorCode(error.error), severity: 'error' };
  },
};
export const jsonLinesValidator:DocumentValidator={validate(text){
 const records=text.split(/\r\n|\n/);let line=1;for(const record of records){
  if(line===records.length&&record===''&&/\n$/.test(text))break;
  const error=jsonValidator.validate(record);if(error)return {...error,line};line++;
 }return null;
}};
